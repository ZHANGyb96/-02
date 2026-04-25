/**
 * @fileoverview 定义数据仓储的抽象接口
 */
import { User } from "../../types/user";

/**
 * 授权与系统配置仓储接口
 */
export interface ILicenseRepository {
    isKeyUsed(licenseKey: string): Promise<boolean>;
    recordRedemption(licenseKey: string, userId: number | string): Promise<void>;
    
    // 新增：系统配置动态管理
    getSettings(): Promise<{ public_key: string | null, private_key: string | null }>;
    updateSettings(publicKey: string, privateKey: string): Promise<void>;
}

/**
 * 行情与回测数据仓储接口
 */
export interface IKlineRepository {
    getKline(stockCode: string, period: string, limit: number): Promise<any[]>;
    getAggregate(stockCode: string): Promise<any | null>;
    runBacktestQuery(stockCode: string, period: string, whereClause: string, params: any[]): Promise<any>;
    getBacktestSignals(stockCode: string, period: string, whereClause: string, params: any[], limit: number, offset: number): Promise<any[]>;
    getUniqueSymbols(): Promise<{ stock_code: string, stock_name: string | null }[]>;
    deleteBySymbol(stockCode: string): Promise<{ deletedRows: number }>;
}

/**
 * 任务仓储接口
 */
export interface ITaskRepository {
    createTask(userId: number | string, strategyName: string, strategyParams: any): Promise<any>;
    getTaskById(taskId: string): Promise<any | null>;
    updateTaskStatus(taskId: string, status: 'RUNNING' | 'COMPLETED' | 'FAILED', result?: any): Promise<any>;
    checkActionLimit(userId: number | string, actionType: string): Promise<{ allowed: boolean; message: string }>;
    recordAction(userId: number | string, actionType: string, clientId: string): Promise<void>;
}

/**
 * 用户数据仓储接口 - 支持混合授权模式
 */
export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findById(id: number | string): Promise<User | null>;
    findAll(): Promise<User[]>;
    createUser(email: string, passwordHash: string): Promise<User>;
    updateUserLicense(userId: number | string, licenseKey: string | null): Promise<void>;
    updateUserRole(userId: number | string, role: string): Promise<void>;
}
