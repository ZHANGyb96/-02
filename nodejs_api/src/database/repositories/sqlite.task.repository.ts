import type { ITaskRepository } from "./interfaces";
import { getSQLiteConnection } from "../connection";
import type { Database } from "sqlite3";
import path from "path";
import fs from "fs";

/**
 * 辅助函数：处理 BigInt 的 JSON 序列化
 */
const safeJsonStringify = (obj: any) => {
    return JSON.stringify(obj, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
    );
};

export class SQLiteTaskRepository implements ITaskRepository {
    
    private db: Database;

    constructor() {
        const dbPath = process.env.SQLITE_PATH || '../local_data/alphascan_tasks.sqlite';
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.db = getSQLiteConnection();
        this.init();
    }

    private init(): void {
        const sqlTasks = `
            CREATE TABLE IF NOT EXISTS backtest_tasks (
                task_id TEXT PRIMARY KEY,
                user_id INTEGER,
                strategy_name TEXT,
                strategy_params TEXT,
                status TEXT CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')) DEFAULT 'PENDING',
                result_summary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            );
        `;
        const sqlLogs = `
            CREATE TABLE IF NOT EXISTS system_action_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action_type TEXT,
                client_id TEXT,
                executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `;
        this.db.run(sqlTasks);
        this.db.run(sqlLogs);
    }

    createTask(userId: number, strategyName: string, strategyParams: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const sql = `
                INSERT INTO backtest_tasks (task_id, user_id, strategy_name, strategy_params)
                VALUES (?, ?, ?, ?)
            `;
            // 使用辅助函数安全序列化 strategyParams
            const params = [taskId, userId, strategyName, safeJsonStringify(strategyParams)];
            this.db.run(sql, params, (err) => {
                if (err) return reject(err);
                this.getTaskById(taskId).then(resolve).catch(reject);
            });
        });
    }
    
    getTaskById(taskId: string): Promise<any | null> {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM backtest_tasks WHERE task_id = ?`;
            this.db.get(sql, [taskId], (err, row: any) => {
                if (err) return reject(err);
                if (row) {
                    try {
                        if (row.strategy_params) row.strategy_params = JSON.parse(row.strategy_params);
                        if (row.result_summary) row.result_summary = JSON.parse(row.result_summary);
                    } catch (e) {}
                }
                resolve(row || null);
            });
        });
    }

    updateTaskStatus(taskId: string, status: "RUNNING" | "COMPLETED" | "FAILED", result?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const completedAt = (status === 'COMPLETED' || status === 'FAILED') ? new Date().toISOString() : null;
            const sql = `UPDATE backtest_tasks SET status = ?, result_summary = ?, completed_at = ? WHERE task_id = ?`;
            
            // 关键修复：使用辅助函数处理可能含有 BigInt 的回测结果
            const resultString = result ? safeJsonStringify(result) : null;
            
            this.db.run(sql, [status, resultString, completedAt, taskId], function(err) {
                if (err) return reject(err);
                resolve({ changes: this.changes });
            });
        });
    }

    async checkActionLimit(userId: number, actionType: string): Promise<{ allowed: boolean; message: string }> {
        return new Promise((resolve, reject) => {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const isMorning = now.getHours() < 12;
            const windowName = isMorning ? "上午" : "下午";
            
            const startOfWindow = isMorning 
                ? startOfDay 
                : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).toISOString();
            
            const endOfWindow = isMorning
                ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 59, 59).toISOString()
                : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

            const sql = `
                SELECT COUNT(*) as count 
                FROM system_action_logs 
                WHERE user_id = ? AND action_type = ? AND executed_at BETWEEN ? AND ?
            `;

            this.db.get(sql, [userId, actionType, startOfWindow, endOfWindow], (err, row: any) => {
                if (err) return reject(err);
                if (row && row.count > 0) {
                    resolve({ allowed: false, message: `今日${windowName}已同步过全库数据，请勿频繁操作以保护API账号安全。` });
                } else {
                    resolve({ allowed: true, message: "允许执行" });
                }
            });
        });
    }

    async recordAction(userId: number, actionType: string, clientId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO system_action_logs (user_id, action_type, client_id) VALUES (?, ?, ?)`;
            this.db.run(sql, [userId, actionType, clientId], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
}