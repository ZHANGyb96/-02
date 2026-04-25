import type { IUserRepository } from './interfaces';
import { getSQLiteConnection } from '../connection';
import type { Database } from 'sqlite3';
import type { User } from '../../types/user';
import path from 'path';
import fs from 'fs';

export class SQLiteUserRepository implements IUserRepository {
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
        this.db.serialize(() => {
            const createTableSql = `
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    license_key TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `;
            
            this.db.run(createTableSql, (err) => {
                if (err) {
                    console.error("[SQLite-User] 无法初始化用户表", err);
                    return;
                }
                
                // 自动检测并补齐缺失字段
                this.db.all(`PRAGMA table_info(users);`, (infoErr, columns: any[]) => {
                    if (infoErr || !columns) return;
                    const colNames = columns.map(c => c.name);
                    
                    if (!colNames.includes('license_key')) {
                        this.db.run(`ALTER TABLE users ADD COLUMN license_key TEXT;`);
                    }
                    if (!colNames.includes('role')) {
                        this.db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';`);
                    }
                });
            });
        });
    }

    findByEmail(email: string): Promise<User | null> {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT id, email, password_hash as passwordHash, role, license_key as licenseKey FROM users WHERE email = ?', [email], (err, row: any) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    }

    findById(id: number | string): Promise<User | null> {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT id, email, password_hash as passwordHash, role, license_key as licenseKey FROM users WHERE id = ?', [id], (err, row: any) => {
                if (err) {
                    // 防御逻辑：如果表还没准备好
                    if (err.message.includes('no such table')) return resolve(null);
                    return reject(err);
                }
                resolve(row || null);
            });
        });
    }

    findAll(): Promise<User[]> {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT id, email, role, license_key as licenseKey, created_at FROM users ORDER BY created_at DESC', (err, rows: any[]) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }

    createUser(email: string, passwordHash: string): Promise<User> {
        return new Promise((resolve, reject) => {
            // 第一个注册的用户自动成为管理员
            this.db.get('SELECT COUNT(*) as count FROM users', (err, row: any) => {
                const role = (row && row.count === 0) ? 'admin' : 'user';
                const sql = 'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)';
                this.db.run(sql, [email, passwordHash, role], function (err) {
                    if (err) return reject(err);
                    resolve({ id: this.lastID, email, passwordHash, role });
                });
            });
        });
    }

    updateUserLicense(userId: number | string, licenseKey: string | null): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET license_key = ? WHERE id = ?';
            this.db.run(sql, [licenseKey, userId], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    updateUserRole(userId: number | string, role: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET role = ? WHERE id = ?';
            this.db.run(sql, [role, userId], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }
}
