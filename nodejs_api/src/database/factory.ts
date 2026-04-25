/**
 * @fileoverview 数据库工厂，根据商业化要求重构为“商业授权+用户体系”混合仓储模式。
 */
import type { IKlineRepository, ITaskRepository, ILicenseRepository, IUserRepository } from './repositories/interfaces';

// 云端实现 (按需加载)
import { DorisKlineRepository } from './repositories/doris.kline.repository';
import { PostgresTaskRepository } from './repositories/postgres.task.repository';
import { PostgresUserRepository } from './repositories/postgres.user.repository';

// 本地实现 (按需加载)
import { DuckDBKlineRepository } from './repositories/duckdb.kline.repository';
import { SQLiteTaskRepository } from './repositories/sqlite.task.repository';
import { SQLiteUserRepository } from './repositories/sqlite.user.repository';
import { SQLiteLicenseRepository } from './repositories/sqlite.license.repository';

export class DatabaseFactory {
    private static klineRepoInstance: IKlineRepository;
    private static taskRepoInstance: ITaskRepository;
    private static userRepoInstance: IUserRepository;
    private static licenseRepoInstance: ILicenseRepository;

    /**
     * 获取行情数据仓储的实例
     */
    public static getKlineRepository(): IKlineRepository {
        if (this.klineRepoInstance) return this.klineRepoInstance;
        
        const mode = process.env.DB_MODE || 'local';
        
        if (mode === 'local') {
            console.log("正在初始化 [DuckDB] 作为行情数据源...");
            this.klineRepoInstance = new DuckDBKlineRepository();
        } else {
            console.log("正在初始化 [Doris] 作为行情数据源...");
            this.klineRepoInstance = new DorisKlineRepository();
        }
        return this.klineRepoInstance;
    }

    /**
     * 获取回测任务仓储的实例
     */
    public static getTaskRepository(): ITaskRepository {
        if (this.taskRepoInstance) return this.taskRepoInstance;
        
        const mode = process.env.DB_MODE || 'local';
        
        if (mode === 'cloud') {
            console.log("正在初始化 [PostgreSQL] 作为任务数据源...");
            this.taskRepoInstance = new PostgresTaskRepository();
        } else {
            console.log("正在初始化 [SQLite] 作为任务数据源...");
            this.taskRepoInstance = new SQLiteTaskRepository();
        }
        return this.taskRepoInstance;
    }

    /**
     * [复活] 获取用户仓储的实例，支持邮箱登录与资产绑定
     */
    public static getUserRepository(): IUserRepository {
        if (this.userRepoInstance) return this.userRepoInstance;

        const mode = process.env.DB_MODE || 'local';
        
        if (mode === 'cloud') {
            console.log("正在初始化 [PostgreSQL] 作为用户数据源...");
            this.userRepoInstance = new PostgresUserRepository();
        } else {
            console.log("正在初始化 [SQLite] 作为用户数据源...");
            this.userRepoInstance = new SQLiteUserRepository();
        }
        
        return this.userRepoInstance;
    }

    /**
     * 获取商业授权仓储的实例
     */
    public static getLicenseRepository(): ILicenseRepository {
        if (!this.licenseRepoInstance) {
            // 授权状态始终存储在本地 SQLite，确保离线验证能力
            this.licenseRepoInstance = new SQLiteLicenseRepository();
        }
        return this.licenseRepoInstance;
    }
}
