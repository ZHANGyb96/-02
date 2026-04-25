/**
 * @fileoverview 统一管理数据库连接实例。
 */
import { createPool, Pool as MysqlPool } from 'mysql2/promise';
import { Pool as PgPool } from 'pg';
import duckdb from 'duckdb';
import sqlite3 from 'sqlite3';

// --- Doris/MySQL 连接池 ---
let dorisPool: MysqlPool | null = null;
export function getDorisConnection(): MysqlPool {
    if (dorisPool) return dorisPool;
    try {
        dorisPool = createPool({
            host: process.env.DORIS_HOST || '127.0.0.1',
            user: process.env.DORIS_USER || 'root',
            password: process.env.DORIS_PASSWORD || '',
            database: process.env.DORIS_DB_NAME || 'alphascan_data',
            port: Number(process.env.DORIS_PORT) || 9030,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        console.log("成功创建 Doris/MySQL 连接池。");
        return dorisPool;
    } catch (error) {
        console.error("创建 Doris/MySQL 连接池失败:", error);
        process.exit(1);
    }
}

// --- PostgreSQL 连接池 ---
let pgPool: PgPool | null = null;
export function getPostgresConnection(): PgPool {
    if (pgPool) return pgPool;
    try {
        pgPool = new PgPool({
            user: process.env.POSTGRES_USER || 'user',
            host: process.env.POSTGRES_HOST || 'localhost',
            database: process.env.POSTGRES_DB || 'alphascan',
            password: process.env.POSTGRES_PASSWORD || 'password',
            port: Number(process.env.POSTGRES_PORT) || 5432,
        });
        console.log("成功创建 PostgreSQL 连接池。");
        return pgPool;
    } catch (error) {
        console.error("创建 PostgreSQL 连接池失败:", error);
        process.exit(1);
    }
}

// --- SQLite 连接 ---
let sqliteInstance: sqlite3.Database | null = null;
export function getSQLiteConnection(): sqlite3.Database {
    if (sqliteInstance) return sqliteInstance;
    const path = process.env.SQLITE_PATH || '../local_data/alphascan_tasks.sqlite';
    sqliteInstance = new sqlite3.Database(path);
    console.log(`成功连接到 SQLite 数据库: ${path}`);
    return sqliteInstance;
}
