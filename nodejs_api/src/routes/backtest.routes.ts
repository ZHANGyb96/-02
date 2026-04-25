import express from 'express';
import * as backtestController from '../controllers/backtest.controller';
import { heavyRateLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

/**
 * @route   POST /api/v1/backtest/submit
 * @desc    提交一个新的回测任务
 */
router.post('/backtest/submit', heavyRateLimiter, backtestController.submitBacktest);

/**
 * @route   GET /api/v1/tasks/:taskId
 * @desc    查询特定回测任务的状态和结果
 */
router.get('/tasks/:taskId', backtestController.getTaskStatus);

/**
 * @route   GET /api/v1/tasks/:taskId/signals
 * @desc    获取特定回测任务的详细信号列表
 */
router.get('/tasks/:taskId/signals', backtestController.getTaskSignals);

export default router;
