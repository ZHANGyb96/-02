import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { DatabaseFactory } from '../database/factory';

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key-for-development';
const userRepo = DatabaseFactory.getUserRepository();

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: '未授权：缺少Bearer令牌' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
        const user = await userRepo.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ message: '未授权：用户不存在' });
        }

        // 注入用户信息到请求中
        (req as any).user = user;
        next();
    } catch (error) {
        return res.status(403).json({ message: '禁止访问：无效的令牌' });
    }
};
