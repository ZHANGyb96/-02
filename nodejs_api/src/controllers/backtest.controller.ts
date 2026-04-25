import { Request, Response } from 'express';
import { DatabaseFactory } from '../database/factory';
import { backtestService } from '../services/backtest.service';
import { User } from '../types/user';

const taskRepo = DatabaseFactory.getTaskRepository();

export const submitBacktest = async (req: Request, res: Response) => {
    // 【新增】: 接收 startTime, endTime 参数
    const { stockCode, period, conditions, strategyName, preset, startTime, endTime } = req.body;
    // The user object is injected by the authMiddleware
    const user = (req as any).user as User;

    // 前置风控与参数校验 (如果提供了 preset，则 conditions 不是必填的)
    if (!stockCode || !period || (!conditions && !preset) || !strategyName) {
        return res.status(400).json({ message: "缺少必要参数: stockCode, period, conditions 或 preset, strategyName。" });
    }
    // 可以在此添加更多风控逻辑，例如限制回测的时间范围、复杂度等

    try {
        // 【新增】: 将 startTime, endTime 存入数据库任务参数中
        const task = await taskRepo.createTask(user.id, strategyName, { 
            stockCode, period, conditions, preset, startTime, endTime 
        });
        
        // 关键：将任务交由后台服务异步执行，不阻塞当前请求
        // 【新增】: 将 startTime, endTime 传递给 Service 层
        backtestService.run(task.task_id, stockCode, period, conditions, preset, startTime, endTime)
            .catch(err => {
                // 在真实应用中, 需要有更健壮的错误日志和监控系统
                console.error(`[FATAL] 回测任务 ${task.task_id} 执行时出现未捕获的严重错误:`, err);
            });
    
        res.status(202).json({ 
            message: '回测任务已接受',
            taskId: task.task_id
        });
    } catch (error) {
        console.error(`创建回测任务时出错:`, error);
        res.status(500).json({ message: "创建任务时出错。" });
    }
};

export const getTaskStatus = async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const user = (req as any).user as User;
    
    try {
        const task = await taskRepo.getTaskById(taskId);
        if (task) {
            // 【保留】安全检查：确保用户只能查询自己的任务
            if (task.user_id !== user.id) {
                return res.status(403).json({ message: '禁止访问：您无权查看此任务。' });
            }
            res.json(task);
        } else {
            res.status(404).json({ message: '未找到任务' });
        }
    } catch (error) {
        // 【保留】详细错误日志
        console.error(`获取任务 ${taskId} 时出错:`, error);
        res.status(500).json({ message: "获取任务时出错。" });
    }
};

export const getTaskSignals = async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const user = (req as any).user as User;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const page = parseInt(req.query.page as string, 10) || 1;
    const offset = (page - 1) * limit;

    try {
        // 【保留】Task ownership check (极其重要的防越权校验)
        const task = await taskRepo.getTaskById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found.' });
        }
        if (task.user_id !== user.id) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const { signals, total } = await backtestService.getSignalDetails(taskId, limit, offset);
        
        res.json({
            data: signals,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        });

    } catch (error: any) {
        // 【保留】底层数据库锁异常捕获，优化用户体验
        if (error.message === "DB_LOCKED_BY_PYTHON") {
            return res.status(503).json({ message: "后台正在执行写操作，信号详情暂不可用，请稍后重试。" });
        }
        if (error.message === 'DB_DISCONNECTED') {
            return res.status(503).json({ message: "数据库已断开，这通常是由于正在进行数据管理操作。请稍后重试。" });
        }
        
        // 【保留】详细错误日志
        console.error(`Error getting signals for task ${taskId}:`, error);
        res.status(500).json({ message: "Error getting signal details." });
    }
};