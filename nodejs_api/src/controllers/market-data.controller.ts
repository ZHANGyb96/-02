

import { Request, Response } from 'express';
import { DatabaseFactory } from '../database/factory';
import { spawn } from 'child_process';
import path from 'path';

const klineRepo = DatabaseFactory.getKlineRepository();

export const getSymbols = async (req: Request, res: Response) => {
    try {
        const symbols = await klineRepo.getUniqueSymbols();
        res.json(symbols);
    } catch (error: any) {
        console.error(`获取所有品种代码时出错：`, error);
        res.status(500).json({ message: "查询数据库时出错。" });
    }
};

export const getKlineData = async (req: Request, res: Response) => {
    const { stockCode } = req.params;
    // 提高默认 limit 到 5000，确保默认情况下能加载更多数据
    const { period = '1d', limit = 5000 } = req.query;

    if (!stockCode) {
        return res.status(400).json({ message: "必须提供股票代码参数。" });
    }

    try {
        const data = await klineRepo.getKline(
            stockCode as string, 
            period as string, 
            Number(limit)
        );
        res.json(data);
    } catch (error: any) {
        if (error.message === "DB_LOCKED_BY_PYTHON") {
            return res.status(503).json({ message: "后台正在执行写操作，市场数据暂不可用，请稍后重试。" });
        }
        console.error(`获取 ${stockCode} 的K线数据时出错：`, error);
        res.status(500).json({ message: "查询数据库时出错。" });
    }
};

export const getAggregateData = async (req: Request, res: Response) => {
    const { stockCode } = req.params;
    if (!stockCode) {
        return res.status(400).json({ message: "必须提供股票代码参数。" });
    }

    try {
        const data = await klineRepo.getAggregate(stockCode as string);
        if (data) {
            res.json(data);
        } else {
            res.status(404).json({ message: "未找到聚合数据。" });
        }
    } catch (error: any) {
        if (error.message === "DB_LOCKED_BY_PYTHON") {
            return res.status(503).json({ message: "后台正在执行写操作，聚合指标暂不可用，请稍后重试。" });
        }
        console.error(`获取 ${stockCode} 的聚合指标时出错：`, error);
        res.status(500).json({ message: "查询数据库时出错。" });
    }
};

export const deleteSymbolData = async (req: Request, res: Response) => {
    const { stockCode } = req.params;
    if (!stockCode) {
        return res.status(400).json({ message: "必须提供股票代码参数。" });
    }

    try {
        const result = await klineRepo.deleteBySymbol(stockCode);
        res.json({ message: `成功删除品种 ${stockCode} 的 ${result.deletedRows} 条相关数据。`, deletedRows: result.deletedRows });
    } catch (error: any) {
        console.error(`删除 ${stockCode} 的数据时出错：`, error);
        res.status(500).json({ message: "操作数据库时出错。" });
    }
};
