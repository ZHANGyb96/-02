import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { DatabaseFactory } from '../database/factory';
import { User } from '../types/user';

const userRepo = DatabaseFactory.getUserRepository();
const licenseRepo = DatabaseFactory.getLicenseRepository();

/**
 * 核心授权逻辑：优先从数据库读取动态公钥，无则从环境变量兜底
 */
const resolvePublicKey = async () => {
    try {
        const settings = await licenseRepo.getSettings();
        const key = settings.public_key || process.env.APP_PUBLIC_KEY;
        if (!key) return null;
        return key.replace(/\\n/g, '\n');
    } catch (e) {
        return process.env.APP_PUBLIC_KEY?.replace(/\\n/g, '\n') || null;
    }
};

export const licenseMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user as User;
        const publicKey = await resolvePublicKey();
        
        if (!user) {
            return res.status(401).json({ message: '身份认证失败，请重新登录' });
        }

        // 如果中间件报错，通常是因为数据库还没初始化好
        let userInfo;
        try {
            userInfo = await userRepo.findById(user.id);
        } catch (e) {
            // 数据库初始化期间，降级为 BASIC
            (req as any).license = { isValid: false, tier: 'BASIC' };
            return next();
        }

        const licenseKey = userInfo?.licenseKey;
        
        let tier = 'BASIC';
        let decoded: any = null;

        if (licenseKey && publicKey) {
            try {
                decoded = jwt.verify(licenseKey, publicKey, { algorithms: ['RS256'] }) as any;
                const now = Math.floor(Date.now() / 1000);
                // 只有未过期且 tier 合法的才生效
                if (!decoded.exp || decoded.exp > now) {
                    tier = decoded.tier || 'BASIC';
                }
            } catch (e) {
                // 验签失败或过期，回退到 BASIC
                tier = 'BASIC';
            }
        }

        (req as any).license = { isValid: tier !== 'BASIC', tier };

        // 业务权限阻断逻辑
        const path = req.originalUrl;
        if (path.includes('/data/sync-all') && tier === 'BASIC') {
            return res.status(403).json({ message: '您的当前等级(BASIC)不支持全库同步，请升级 PRO。' });
        }
        if (path.includes('/data/sync') && tier === 'BASIC') {
            const { periods } = req.body;
            // 基础版禁止同步分钟线
            if (periods && periods.some((p: string) => p.includes('m'))) {
                return res.status(403).json({ message: '普通版仅支持日线数据，获取分钟线请升级 PRO 版本。' });
            }
        }

        next();
    } catch (error) {
        console.error("[LicenseMiddleware] 严重系统错误:", error);
        // 任何系统级异常，绝不掐断连接，而是降级运行
        (req as any).license = { isValid: false, tier: 'BASIC' };
        next();
    }
};
