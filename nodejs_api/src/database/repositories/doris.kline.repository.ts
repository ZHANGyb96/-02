import type { IKlineRepository } from "./interfaces";
import { getDorisConnection } from "../connection";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

/**
 * 统一的数据行映射函数。
 * 由于 Python 引擎现在保证了列名和数据类型的一致性，
 * 这个函数现在只作为一个简单的、类型安全的传递层。
 * @param row - 从数据库查询出的单行数据
 */
function mapRow(row: RowDataPacket) {
    // The Python engine now guarantees consistent column names and data types.
    // The mysql2 driver correctly handles number types.
    // This function now serves as a simple passthrough.
    return row;
}


/**
 * Apache Doris 行情数据仓储实现
 */
export class DorisKlineRepository implements IKlineRepository {
    
    private pool: Pool;

    constructor() {
        this.pool = getDorisConnection();
    }
    
    async getKline(stockCode: string, period: string, limit: number): Promise<any[]> {
        try {
            const sql = `
                SELECT *
                FROM kline_metrics
                WHERE stock_code = ? AND period = ?
                ORDER BY time DESC
                LIMIT ?;
            `;
            const [rows] = await this.pool.query<RowDataPacket[]>(sql, [stockCode, period, limit]);
            return rows.map(mapRow);
        } catch (error: any) {
            console.warn(`[Doris] Warning in getKline for ${stockCode}, returning empty list. Error:`, (error as Error).message);
            return [];
        }
    }

    async getAggregate(stockCode: string): Promise<any | null> {
        // 此查询演示了 Doris 的聚合函数
        // 计算日线数据在过去一年中的聚合指标
        const sql = `
            SELECT 
                COUNT(*) as trading_days_1y,
                AVG(volume) as avg_volume_1y,
                MAX(high) as max_high_1y,
                MIN(low) as min_low_1y
            FROM kline_metrics
            WHERE 
                stock_code = ? AND
                period = '1d' AND
                time >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            GROUP BY stock_code;
        `;
        const [rows] = await this.pool.query(sql, [stockCode]);

        if (Array.isArray(rows) && rows.length > 0) {
            return rows[0];
        } else {
            return null;
        }
    }

    async runBacktestQuery(stockCode: string, period: string, whereClause: string, params: any[]): Promise<any> {
        throw new Error("Deprecated: Backtesting is now handled dynamically by the Python Engine.");
    }

    async getBacktestSignals(stockCode: string, period: string, whereClause: string, params: any[], limit: number, offset: number): Promise<any[]> {
        throw new Error("Deprecated: Backtesting is now handled dynamically by the Python Engine.");
    }

    async getUniqueSymbols(): Promise<string[]> {
        try {
            const sql = `SELECT DISTINCT stock_code FROM kline_metrics ORDER BY stock_code;`;
            const [rows] = await this.pool.query<RowDataPacket[]>(sql);
            return rows.map((row: any) => row.stock_code);
        } catch (error: any) {
            // For getUniqueSymbols, any error (table not found, connection error, etc.)
            // is not critical. We can return an empty list and let the user proceed.
            // The user can sync data to fix the issue.
            console.warn(`[Doris] Warning in getUniqueSymbols, returning empty list. Error:`, (error as Error).message);
            return [];
        }
    }

    async deleteBySymbol(stockCode: string): Promise<{ deletedRows: number; }> {
        const sql = `DELETE FROM kline_metrics WHERE stock_code = ?;`;
        // For DML statements, query() returns a ResultSetHeader
        const [result] = await this.pool.query<ResultSetHeader>(sql, [stockCode]);
        const affectedRows = result.affectedRows || 0;
        console.log(`[Doris] Submitted DELETE job for stock_code=${stockCode}. Reported affected rows: ${affectedRows}`);
        return { deletedRows: affectedRows };
    }
}
