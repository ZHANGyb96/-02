import type { IUserRepository } from './interfaces';
import { getPostgresConnection } from '../connection';
import type { Pool } from 'pg';
import type { User } from '../../types/user';

export class PostgresUserRepository implements IUserRepository {
    private pool: Pool;

    constructor() {
        this.pool = getPostgresConnection();
    }

    async findByEmail(email: string): Promise<User | null> {
        const res = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (res.rows.length === 0) {
            return null;
        }
        const { id, password_hash } = res.rows[0];
        return { id, email, passwordHash: password_hash };
    }

    async findById(id: number): Promise<User | null> {
        const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (res.rows.length === 0) {
            return null;
        }
        const { email, password_hash } = res.rows[0];
        return { id, email, passwordHash: password_hash };
    }

    async createUser(email: string, passwordHash: string): Promise<User> {
        const res = await this.pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash',
            [email, passwordHash]
        );
        const { id, password_hash } = res.rows[0];
        return { id, email, passwordHash: password_hash };
    }
}
