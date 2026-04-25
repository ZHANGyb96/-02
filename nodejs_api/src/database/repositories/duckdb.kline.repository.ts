import type { IKlineRepository } from "./interfaces";
import duckdb from 'duckdb';
import path from "path";
import fs from "fs";

const DUCKDB_PATH = path.resolve(
    process.cwd(),
    process.env.DUCKDB_PATH || '../local_data/alphascan.duckdb'
);

const TABLE_NAME = 'kline_metrics';

export class DuckDBKlineRepository implements IKlineRepository {
    
    private isInitializing: Promise<void>;

    constructor() {
        this.isInitializing = this.initializeSchema();
    }

    // ── 桩方法：已废弃长期保持连接的设计，直接返回已完成的 Promise ──
    // 在这套新架构中，Node.js 平时从不霸占文件锁，所以完全不需要释放锁或重连
    public static async releaseForPython(): Promise<void> {
        return Promise.resolve();
    }
    public static reconnect(): void {}
    public static isReleased(): boolean { return false; }

    private async initializeSchema(): Promise<void> {
        const dbDir = path.dirname(DUCKDB_PATH);
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

        return new Promise<void>((resolve, reject) => {
            let db: duckdb.Database;
            try {
                // 初始化时使用写模式打开，确保数据库文件创建并可建表
                db = new duckdb.Database(DUCKDB_PATH);
            } catch (e) {
                console.error("[DuckDB-Node] Failed to open DB for initialization:", e);
                return resolve(); // 优雅降级，允许跳过建表
            }
            
            const con = db.connect();

            const createTableSql = `
            CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
                time TIMESTAMP, stock_code VARCHAR, stock_name VARCHAR, period VARCHAR,
                open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, volume DOUBLE,
                PRIMARY KEY (time, stock_code, period)
            );`;

            con.exec(createTableSql, (err: any) => {
                if (err) {
                    console.error("[DuckDB-Node] Schema init error:", err);
                    db.close(() => resolve());
                    return;
                }
                console.log(`[DuckDB-Node] Schema for '${TABLE_NAME}' is ready.`);

                con.all(`PRAGMA table_info(${TABLE_NAME});`, (infoErr: any, columns: any[]) => {
                    if (infoErr || !columns) {
                        db.close(() => resolve());
                        return;
                    }
                    const colMap = new Map(columns.map(c => [c.name, c.type]));
                    
                    const alterQueries: string[] = [];
                    if (!colMap.has('stock_name')) {
                        alterQueries.push(`ALTER TABLE ${TABLE_NAME} ADD COLUMN stock_name VARCHAR;`);
                    }
                    if (colMap.get('period') === 'DOUBLE' || colMap.get('period') === 'FLOAT') {
                        alterQueries.push(`ALTER TABLE ${TABLE_NAME} ALTER period TYPE VARCHAR;`);
                    }
                    if (colMap.get('volume') === 'INTEGER' || colMap.get('volume') === 'INT32') {
                        alterQueries.push(`ALTER TABLE ${TABLE_NAME} ALTER volume TYPE DOUBLE;`);
                    }

                    if (alterQueries.length === 0) {
                        db.close(() => resolve());
                        return;
                    }

                    let pending = alterQueries.length;
                    for (const q of alterQueries) {
                        con.exec(q, (e: any) => {
                            if (e) console.error("[DuckDB-Node] Alter err:", e);
                            pending--;
                            if (pending <= 0) {
                                db.close(() => resolve());
                            }
                        });
                    }
                });
            });
        });
    }

    /**
     * 短暂会话(Ephemeral Session)核心方法：每次调用都会产生一次独立的临时连接。
     * Node 侧只在执行语句的几十毫秒内持锁（或持有只读许可），完美避开多进程锁竞争和 C++ 指针异常。
     */
    private async executeSession<T>(operation: (con: duckdb.Connection) => Promise<T>, readOnly: boolean = false): Promise<T> {
        await this.isInitializing;

        return new Promise<T>((resolve, reject) => {
            let db: duckdb.Database;
            try {
                // 如果是只读查询，传入 flag = 1 (OPEN_READONLY)，Node 将允许多个进程同时读取，不会独占死锁文件
                const flag = readOnly ? 1 : undefined;
                db = new duckdb.Database(DUCKDB_PATH, flag);
            } catch (e) {
                return reject(e);
            }

            const con = db.connect();
            
            operation(con)
                .then((res) => {
                    db.close(() => resolve(res));
                })
                .catch((err) => {
                    db.close(() => reject(err));
                });
        });
    }

    private all<T>(sql: string, params: any[]): Promise<T[]> {
        return this.executeSession((con) => {
            return new Promise((resolve, reject) => {
                con.all(sql, ...params, (err: any, result: any) => {
                    if (err) return reject(err);
                    resolve(result as T[]);
                });
            });
        }, true); // 这里明确指定该查询仅为读取，使用 OPEN_READONLY
    }

    private get<T>(sql: string, params: any[]): Promise<T | null> {
        return this.executeSession((con) => {
            return new Promise((resolve, reject) => {
                con.all(sql, ...params, (err: any, result: any) => {
                    if (err) return reject(err);
                    const rows = result as T[];
                    resolve(rows.length > 0 ? rows[0] : null);
                });
            });
        }, true); // 这里明确指定该查询仅为读取，使用 OPEN_READONLY
    }

    async bulkUpsertFromCSV(csvPath: string): Promise<void> {
        await this.isInitializing;
        const tempViewName      = `temp_new_data_${Date.now()}`;
        const normalizedCsvPath = csvPath.replace(/\\/g, '/');

        const columns = [
            'time', 'stock_code', 'stock_name', 'period',
            'open', 'high', 'low', 'close', 'volume'
        ].join(', ');

        return this.executeSession((con) => {
            return new Promise<void>((resolve, reject) => {
                con.exec("BEGIN TRANSACTION;", (err: any) => {
                    if (err) return reject(err);

                    const queries = [
                        `CREATE TEMP VIEW ${tempViewName} AS SELECT * FROM read_csv('${normalizedCsvPath}', types={'stock_code': 'VARCHAR', 'period': 'VARCHAR', 'stock_name': 'VARCHAR'});`,
                        `DELETE FROM ${TABLE_NAME} WHERE (time, stock_code, period) IN (SELECT time, stock_code, period FROM ${tempViewName});`,
                        `INSERT INTO ${TABLE_NAME} (${columns}) SELECT ${columns} FROM ${tempViewName};`,
                        `DROP VIEW ${tempViewName};`,
                    ];

                    const executeSequentially = (index: number) => {
                        if (index >= queries.length) {
                            con.exec("COMMIT;", (commitErr: any) => {
                                if (commitErr) {
                                    con.exec("ROLLBACK;");
                                    return reject(commitErr);
                                }
                                resolve();
                            });
                            return;
                        }

                        con.exec(queries[index], (queryErr: any) => {
                            if (queryErr) {
                                con.exec("ROLLBACK;");
                                return reject(queryErr);
                            }
                            executeSequentially(index + 1);
                        });
                    };

                    executeSequentially(0);
                });
            });
        }, false); // 这个操作涉及写数据（如后台更新股票历史数据），所以保持 readWrite = true
    }

    async getKline(stockCode: string, period: string, limit: number): Promise<any[]> {
        const sql = `SELECT * FROM ${TABLE_NAME} WHERE stock_code = ? AND period = ? ORDER BY time DESC LIMIT ?`;
        return this.all<any>(sql, [stockCode, period, limit]);
    }

    async getAggregate(stockCode: string): Promise<any | null> {
        const sql = `
            SELECT
                COUNT(*)    AS trading_days_1y,
                AVG(volume) AS avg_volume_1y,
                MAX(high)   AS max_high_1y,
                MIN(low)    AS min_low_1y
            FROM ${TABLE_NAME}
            WHERE stock_code = ?
              AND period = '1d'
              AND time >= (current_date - interval '1 year')
            GROUP BY stock_code;`;
        return this.get<any>(sql, [stockCode]);
    }

    async getUniqueSymbols(): Promise<{ stock_code: string; stock_name: string | null }[]> {
        const sql = `
            SELECT stock_code, MAX(stock_name) AS stock_name
            FROM ${TABLE_NAME}
            GROUP BY stock_code
            ORDER BY stock_code;`;
        try {
            return await this.all<{ stock_code: string; stock_name: string | null }>(sql, []);
        } catch (err: any) {
            if (err.message && err.message.includes("does not exist")) return [];
            throw err;
        }
    }

    async runBacktestQuery(stockCode: string, period: string, whereClause: string, params: any[]): Promise<any> {
        throw new Error("Deprecated: Backtesting is dynamically handled by Python.");
    }

    async getBacktestSignals(stockCode: string, period: string, whereClause: string, params: any[], limit: number, offset: number): Promise<any[]> {
        throw new Error("Deprecated: Backtesting is dynamically handled by Python.");
    }

    async deleteBySymbol(stockCode: string): Promise<{ deletedRows: number }> {
        const checkSql = `SELECT COUNT(*)::INTEGER AS count FROM ${TABLE_NAME} WHERE stock_code = ?`;
        const res      = await this.get<{ count: number }>(checkSql, [stockCode]);
        const count    = res?.count || 0;

        await this.executeSession((con) => {
            return new Promise((resolve, reject) => {
                con.all(`DELETE FROM ${TABLE_NAME} WHERE stock_code = ?`, stockCode, (err: any) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }, false);
        return { deletedRows: count };
    }
}