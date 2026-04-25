import type { ILicenseRepository } from "./interfaces";
import { getSQLiteConnection } from "../connection";
import type { Database } from "sqlite3";

export class SQLiteLicenseRepository implements ILicenseRepository {
    private db: Database;

    constructor() {
        this.db = getSQLiteConnection();
        this.init();
    }

    private init(): void {
        // 使用 serialize 确保初始化操作按顺序同步执行，防止查询时表还未创建
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS license_redemptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    license_key_hash TEXT UNIQUE NOT NULL,
                    user_id TEXT NOT NULL,
                    redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS app_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    public_key TEXT,
                    private_key TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            this.db.run(`INSERT OR IGNORE INTO app_settings (id) VALUES (1);`);
        });
    }

    isKeyUsed(licenseKey: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const sql = `SELECT id FROM license_redemptions WHERE license_key_hash = ?`;
            this.db.get(sql, [licenseKey], (err, row) => {
                if (err) return reject(err);
                resolve(!!row);
            });
        });
    }

    recordRedemption(licenseKey: string, userId: number | string): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO license_redemptions (license_key_hash, user_id) VALUES (?, ?)`;
            this.db.run(sql, [licenseKey, String(userId)], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    getSettings(): Promise<{ public_key: string | null, private_key: string | null }> {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT public_key, private_key FROM app_settings WHERE id = 1', (err, row: any) => {
                if (err) {
                    // 如果表还没建好就查询，返回默认值而不是抛出异常
                    if (err.message.includes('no such table')) {
                        return resolve({ public_key: null, private_key: null });
                    }
                    return reject(err);
                }
                resolve(row || { public_key: null, private_key: null });
            });
        });
    }

    updateSettings(publicKey: string, privateKey: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE app_settings SET public_key = ?, private_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1';
            this.db.run(sql, [publicKey, privateKey], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
}
