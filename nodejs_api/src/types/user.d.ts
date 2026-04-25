export interface User {
    id: number;
    email: string;
    passwordHash: string;
    role: 'user' | 'admin' | string; // 补齐 role 字段
    licenseKey: string | null;       // 补齐 licenseKey 字段
}