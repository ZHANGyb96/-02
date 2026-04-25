import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { DatabaseFactory } from '../database/factory';
import { User } from '../types/user';

const userRepo = DatabaseFactory.getUserRepository();
const licenseRepo = DatabaseFactory.getLicenseRepository();

/**
 * 环境变量统一化处理：
 * 自动处理 .env 中的换行符转义，确保证书格式正确
 */
const getPublicKey = () => {
    const key = process.env.APP_PUBLIC_KEY;
    if (!key) return null;
    return key.replace(/\\n/g, '\n');
};

/**
 * 激活流程：
 * 1. Identity Gate: 验证用户是否登录
 * 2. Crypto Gate: RSA 离线验签 (JWT)
 * 3. Redemption Gate: 检查该码是否已被其他账号核销 (防一码多充)
 * 4. Persistence: 绑定用户账号并记录核销指纹
 */
export const activate = async (req: Request, res: Response) => {
    const { licenseKey } = req.body;
    const user = (req as any).user as User;
    const publicKey = getPublicKey();

    if (!licenseKey) {
        return res.status(400).json({ message: '激活码不能为空' });
    }

    if (!user) {
        return res.status(401).json({ message: '请先登录账号后再进行激活' });
    }

    if (!publicKey) {
        return res.status(500).json({ message: '系统错误：后端未配置授权公钥 (APP_PUBLIC_KEY)' });
    }

    try {
        // 1. RSA 离线验签
        const decoded = jwt.verify(licenseKey, publicKey, { algorithms: ['RS256'] }) as any;
        
        // 2. 时间效期检查
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < now) {
            return res.status(401).json({ message: '该激活码已过期，请获取最新授权' });
        }

        // 3. 【商业防线】：核销重复性检查 (防止多账号共享同一个码)
        const isUsed = await licenseRepo.isKeyUsed(licenseKey);
        if (isUsed) {
            return res.status(409).json({ message: '激活失败：该激活码已被其他账户核销' });
        }

        // 4. 原子化持久化：将激活码写入用户信息，并存入全局核销表
        await userRepo.updateUserLicense(user.id, licenseKey);
        await licenseRepo.recordRedemption(licenseKey, user.id);

        res.status(200).json({
            message: `权限升级成功！欢迎使用 ${decoded.tier} 版本`,
            tier: decoded.tier,
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : '永久有效'
        });

    } catch (error: any) {
        res.status(401).json({ message: '激活码无效或已被篡改，请确保复制了完整的字符串' });
    }
};

/**
 * 获取当前用户的授权状态
 * 即使无码或过期，也必须下发 tier: 'BASIC' 供前端锁定功能
 */
export const getStatus = async (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const publicKey = getPublicKey();

    if (!user) {
        return res.json({ isValid: false, tier: 'BASIC', message: '未登录' });
    }

    try {
        const userInfo = await userRepo.findById(user.id);
        const licenseKey = userInfo?.licenseKey;

        if (!licenseKey || !publicKey) {
            return res.json({ isValid: false, tier: 'BASIC', message: '当前为基础版' });
        }

        // 实时验签，确保数据库里的码没被篡改且未过期
        const decoded = jwt.verify(licenseKey, publicKey, { algorithms: ['RS256'] }) as any;
        const now = Math.floor(Date.now() / 1000);

        if (decoded.exp && decoded.exp < now) {
            return res.json({ isValid: false, tier: 'BASIC', message: '授权已到期' });
        }

        res.json({
            isValid: true,
            tier: decoded.tier,
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : '永久'
        });

    } catch (error) {
        // 任何解析错误（如私钥重置导致旧公钥无效）一律回退到 BASIC
        res.json({ isValid: false, tier: 'BASIC' });
    }
};