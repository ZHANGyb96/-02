import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DatabaseFactory } from '../database/factory';
import { User } from '../types/user';

const userRepo = DatabaseFactory.getUserRepository();
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key-for-development';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const register = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: '邮箱和密码不能为空' });
    }

    try {
        const existingUser = await userRepo.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: '该邮箱已被注册' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await userRepo.createUser(email, passwordHash);

        res.status(201).json({
            message: '用户注册成功',
            user: { 
                id: newUser.id, 
                email: newUser.email,
                role: newUser.role
            },
        });

    } catch (error: any) {
        res.status(500).json({ message: '服务器错误', error: error.message });
    }
};


export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: '邮箱和密码不能为空' });
    }

    try {
        const user = await userRepo.findByEmail(email);
        if (!user) {
            return res.status(401).json({ message: '认证失败：用户不存在或密码错误' });
        }
        
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: '认证失败：用户不存在或密码错误' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        });

        res.status(200).json({
            message: '登录成功',
            token,
            user: { 
                id: user.id, 
                email: user.email,
                role: user.role 
            },
        });

    } catch (error: any) {
         res.status(500).json({ message: '服务器错误', error: error.message });
    }
};

export const getProfile = async (req: Request, res: Response) => {
    // The user object is injected by the authMiddleware
    const user = (req as any).user as User;

    if (!user) {
        return res.status(401).json({ message: '未授权' });
    }

    res.status(200).json({
        id: user.id,
        email: user.email,
        role: user.role
    });
};
