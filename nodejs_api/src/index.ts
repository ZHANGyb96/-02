import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import { rateLimiter } from './middlewares/rate-limit.middleware';
import { authMiddleware } from './middlewares/auth.middleware';
import { licenseMiddleware } from './middlewares/license.middleware';
import authRouter from './routes/auth.routes';
import licenseRouter from './routes/license.routes';
import backtestRouter from './routes/backtest.routes';
import marketDataRouter from './routes/market-data.routes';
import dataRouter from './routes/data.routes';
import adminRouter from './routes/admin.routes'; // 新增

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: '*',  // 调试阶段放开所有来源，上线后再收紧
    credentials: true
}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    const traceId = req.headers['x-request-id'] || uuidv4();
    (req as any).traceId = traceId;
    res.setHeader('X-Request-Id', traceId);
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} (TraceID: ${traceId})`);
    next();
});

app.use('/api/v1', rateLimiter);

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/license', licenseRouter);
app.use('/api/v1/admin', adminRouter); // 注册管理员路由

app.use('/api/v1/data', authMiddleware, licenseMiddleware, dataRouter);
app.use('/api/v1/market-data', authMiddleware, licenseMiddleware, marketDataRouter);
app.use('/api/v1', authMiddleware, licenseMiddleware, backtestRouter);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const traceId = (req as any).traceId;
    console.error(`\x1b[31m[FATAL ERROR] TraceID: ${traceId}\x1b[0m`, err);
    res.status(err.status || 500).json({ message: err.message || '服务器内部错误', traceId });
});

app.listen(PORT, () => {
  console.log(`==========================================`);
  console.log(`   AlphaScan AI 商业版引擎启动成功`);
  console.log(`   运行端口: ${PORT}`);
  console.log(`==========================================`);
});
