import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { DatabaseFactory } from '../database/factory';

const userRepo = DatabaseFactory.getUserRepository();
const licenseRepo = DatabaseFactory.getLicenseRepository();

export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const users = await userRepo.findAll();
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ message: '获取用户列表失败' });
    }
};

export const updateUserLicense = async (req: Request, res: Response) => {
    const { userId, licenseKey } = req.body;
    try {
        await userRepo.updateUserLicense(userId, licenseKey);
        res.json({ message: '用户授权已更新' });
    } catch (error: any) {
        res.status(500).json({ message: '更新失败' });
    }
};

export const getSystemSettings = async (req: Request, res: Response) => {
    try {
        const settings = await licenseRepo.getSettings();
        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ message: '获取系统配置失败' });
    }
};

export const updateSystemSettings = async (req: Request, res: Response) => {
    const { publicKey, privateKey } = req.body;
    try {
        await licenseRepo.updateSettings(publicKey, privateKey);
        res.json({ message: '系统密钥已动态更新，立即生效。' });
    } catch (error: any) {
        res.status(500).json({ message: '保存配置失败' });
    }
};

export const generateLicense = async (req: Request, res: Response) => {
    const { tier, daysValid } = req.body;
    try {
        const settings = await licenseRepo.getSettings();
        if (!settings.private_key) {
            return res.status(400).json({ message: '生成失败：系统尚未配置私钥。' });
        }

        const iat = Math.floor(Date.now() / 1000);
        const payload: any = { tier, iat };
        if (daysValid > 0) {
            payload.exp = iat + (daysValid * 24 * 60 * 60);
        }

        const privateKey = settings.private_key.replace(/\\n/g, '\n');
        const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
        
        res.json({ license: token });
    } catch (error: any) {
        res.status(500).json({ message: '发码失败，请检查私钥格式。', error: error.message });
    }
};
