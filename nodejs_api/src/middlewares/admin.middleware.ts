import { Request, Response, NextFunction } from 'express';
import { User } from '../types/user';

/**
 * 管理员权限中间件
 */
export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as User;

    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: '权限不足：该操作仅限管理员。' });
    }

    next();
};
