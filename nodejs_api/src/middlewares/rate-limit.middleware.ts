import rateLimit from 'express-rate-limit';

/**
 * 基础 API 限流策略
 * 限制每个 IP 在 15 分钟内最多 100 次请求
 */
export const rateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 分钟
	max: 500, 
	standardHeaders: true,
	legacyHeaders: false,
    message: { message: '请求过于频繁，请稍后再试。' }
});

/**
 * 针对高消耗接口的更严格限流策略
 * 限制每个 IP 在 15 分钟内最多 10 次请求
 */
export const heavyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: 200, // 增加测试允许的请求次数
    standardHeaders: true,
	legacyHeaders: false,
    message: { message: '回测任务提交过于频繁，请稍后再试。' }
});
