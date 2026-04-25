/**
 * @fileoverview 数据库工厂，根据环境变量动态切换数据源实现。
 * 这是实现本地/云端数据源平滑迁移的核心。
 */
import type { IKlineRepository, ITaskRepository, IUserRepository } from './repositories/interfaces';

// 云端实现 (懒加载)
import { DorisKlineRepository } from './repositories/doris.kline.repository';
import { PostgresTaskRepository } from './repositories/postgres.task.repository';
import { PostgresUserRepository } from './repositories/postgres.user.repository';


// 本地实现 (懒加载)
import { DuckDBKlineRepository } from './repositories/duckdb.kline.repository';
import { SQLiteTaskRepository } from './repositories/sqlite.task.repository';
import { SQLiteUserRepository } from './repositories/sqlite.user.repository';


export class DatabaseFactory {
    
    private static klineRepoInstance: IKlineRepository;
    private static taskRepoInstance: ITaskRepository;
    private static userRepoInstance: IUserRepository;


    /**
     * 获取行情数据仓储的实例。
     * @returns IKlineRepository 的一个实现。
     */
    public static getKlineRepository(): IKlineRepository {
        if (this.klineRepoInstance) {
            return this.klineRepoInstance;
        }

        const mode = process.env.DB_MODE || 'cloud';

        if (mode === 'cloud') {
            console.log("正在初始化 [Doris] 作为行情数据源...");
            this.klineRepoInstance = new DorisKlineRepository();
        } else { // local
            console.log("正在初始化 [DuckDB] 作为行情数据源...");
            this.klineRepoInstance = new DuckDBKlineRepository();
        }
        
        return this.klineRepoInstance;
    }

    /**
     * 获取任务数据仓储的实例。
     * @returns ITaskRepository 的一个实现。
     */
    public static getTaskRepository(): ITaskRepository {
        if (this.taskRepoInstance) {
            return this.taskRepoInstance;
        }

        const mode = process.env.DB_MODE || 'cloud';

        if (mode === 'cloud') {
            console.log("正在初始化 [PostgreSQL] 作为任务数据源...");
            this.taskRepoInstance = new PostgresTaskRepository();
        } else { // local
            console.log("正在初始化 [SQLite] 作为任务数据源...");
            this.taskRepoInstance = new SQLiteTaskRepository();
        }
        
        return this.taskRepoInstance;
    }

    /**
     * 获取用户数据仓储的实例。
     * @returns IUserRepository 的一个实现。
     */
    public static getUserRepository(): IUserRepository {
        if (this.userRepoInstance) {
            return this.userRepoInstance;
        }

        const mode = process.env.DB_MODE || 'cloud';
        
        if (mode === 'cloud') {
            console.log("正在初始化 [PostgreSQL] 作为用户数据源...");
            this.userRepoInstance = new PostgresUserRepository();
        } else { // local
            console.log("正在初始化 [SQLite] 作为用户数据源...");
            this.userRepoInstance = new SQLiteUserRepository();
        }
        
        return this.userRepoInstance;
    }
}
