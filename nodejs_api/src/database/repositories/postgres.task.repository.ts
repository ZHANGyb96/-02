import type { ITaskRepository } from "./interfaces";
import { getPostgresConnection } from "../connection";
import type { Pool } from "pg";

export class PostgresTaskRepository implements ITaskRepository {
    
    private pool: Pool;

    constructor() {
        this.pool = getPostgresConnection();
    }
    
    async createTask(userId: number, strategyName: string, strategyParams: any): Promise<any> {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const sql = `
            INSERT INTO backtest_tasks (task_id, user_id, strategy_name, strategy_params)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const res = await this.pool.query(sql, [taskId, userId, strategyName, strategyParams]);
        return res.rows[0];
    }
    
    async getTaskById(taskId: string): Promise<any | null> {
        const sql = `SELECT * FROM backtest_tasks WHERE task_id = $1`;
        const res = await this.pool.query(sql, [taskId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }

    async updateTaskStatus(taskId: string, status: "RUNNING" | "COMPLETED" | "FAILED", result?: any): Promise<any> {
        const completedAt = (status === 'COMPLETED' || status === 'FAILED') ? 'CURRENT_TIMESTAMP' : 'NULL';
        const sql = `
            UPDATE backtest_tasks
            SET status = $1, result_summary = $2, completed_at = ${completedAt}
            WHERE task_id = $3
            RETURNING *;
        `;
        const res = await this.pool.query(sql, [status, result, taskId]);
        return res.rows[0];
    }

    async checkActionLimit(userId: number, actionType: string): Promise<{ allowed: boolean; message: string }> {
        const now = new Date();
        const isMorning = now.getHours() < 12;
        const windowName = isMorning ? "上午" : "下午";
        
        const sql = `
            SELECT COUNT(*) as count 
            FROM system_action_logs 
            WHERE user_id = $1 AND action_type = $2 
            AND executed_at >= DATE_TRUNC('day', NOW()) + (CASE WHEN $3 THEN interval '0' ELSE interval '12 hours' END)
            AND executed_at < DATE_TRUNC('day', NOW()) + (CASE WHEN $3 THEN interval '12 hours' ELSE interval '24 hours' END)
        `;
        
        const res = await this.pool.query(sql, [userId, actionType, isMorning]);
        const count = parseInt(res.rows[0].count, 10);
        
        if (count > 0) {
            return { allowed: false, message: `今日${windowName}已同步过全库数据，请勿频繁操作。` };
        }
        return { allowed: true, message: "允许执行" };
    }

    async recordAction(userId: number, actionType: string, clientId: string): Promise<void> {
        const sql = `INSERT INTO system_action_logs (user_id, action_type, client_id) VALUES ($1, $2, $3)`;
        await this.pool.query(sql, [userId, actionType, clientId]);
    }
}
