
import { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { DatabaseFactory } from '../database/factory';
import { DuckDBKlineRepository } from '../database/repositories/duckdb.kline.repository';
import { User } from '../types/user';

/**
 * 内部辅助函数：运行 Python 引擎并返回生成的 CSV 路径
 * 支持实时将日志写入响应流
 */
const runPythonTask = (args: string[], res: Response): Promise<string | null> => {
    return new Promise((resolve) => {
        const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python';
        const scriptPath = path.resolve(__dirname, '../../../python_engine/main.py');
        
        const pythonProcess = spawn(pythonExecutable, ['-u', scriptPath, ...args], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let csvPath: string | null = null;

        const outputHandler = (data: Buffer) => {
            const output = data.toString();
            res.write(output);
            
            // 捕获 Python 输出的文件路径标记 (PYTHON_OUTPUT_FILE:path)
            const match = output.match(/PYTHON_OUTPUT_FILE:(.*)/);
            if (match && match[1]) {
                csvPath = match[1].trim();
            }
        };

        pythonProcess.stdout.on('data', outputHandler);
        pythonProcess.stderr.on('data', outputHandler);

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                res.write(`\n[API] Python 进程异常退出 (码: ${code})。任务可能未完成。\n`);
                resolve(null);
            } else {
                resolve(csvPath);
            }
        });

        pythonProcess.on('error', (err) => {
            res.write(`\n[API] 致命错误：无法启动 Python 进程 (${err.message})\n`);
            resolve(null);
        });
    });
};

/**
 * 内部辅助函数：执行数据库入库并清理临时文件
 */
const ingestAndCleanup = async (csvPath: string, res: Response): Promise<boolean> => {
    try {
        const klineRepo = DatabaseFactory.getKlineRepository();
        if (!(klineRepo instanceof DuckDBKlineRepository)) {
            throw new Error("当前数据库模式不支持 CSV 批量入库。");
        }

        res.write(`\n[API] 正在将数据从 ${path.basename(csvPath)} 安全导入数据库...`);
        await klineRepo.bulkUpsertFromCSV(csvPath);
        res.write('\n[API] 数据库增量更新成功！历史数据已安全去重并追加。');
        return true;
    } catch (e: any) {
        res.write(`\n[API] 数据库导入失败: ${e.message}`);
        return false;
    } finally {
        await fs.unlink(csvPath).catch(() => {});
        res.write('\n[API] 临时文件已清理。');
    }
};

/**
 * 同步单品种数据
 */
export const syncData = async (req: Request, res: Response) => {
    const { symbol, name, duration, periods } = req.body;
    if (!symbol || !duration || !periods || periods.length === 0) {
        return res.status(400).send('缺少必要参数。');
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();

    const args = ['--symbol', symbol, '--duration', duration, '--periods', ...periods];
    if (name) args.push('--name', name);

    const csvPath = await runPythonTask(args, res);
    if (csvPath) {
        await ingestAndCleanup(csvPath, res);
    }
    
    res.write('\n[API] 任务结束。\n');
    res.end();
};

/**
 * [核心功能] 一键同步全库所有品种
 */
export const syncAllData = async (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const clientId = (req.headers['x-client-id'] as string) || 'web-default';
    const taskRepo = DatabaseFactory.getTaskRepository();
    const klineRepo = DatabaseFactory.getKlineRepository();

    // 1. [风控校验] 检查今日上午/下午执行限制
    const limitCheck = await taskRepo.checkActionLimit(user.id, 'SYNC_ALL');
    if (!limitCheck.allowed) {
        return res.status(429).json({ message: limitCheck.message });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();

    try {
        // 2. 获取底库品种
        const symbols = await klineRepo.getUniqueSymbols();
        if (symbols.length === 0) {
            res.write("[Node.js] 数据库中没有发现任何品种，任务提前结束。\n");
            return res.end();
        }

        res.write(`[Node.js] 发现 ${symbols.length} 个品种，开始全局批量增量同步...\n`);
        res.write(`[Node.js] 操作员: ${user.email} | 设备ID: ${clientId}\n\n`);

        let successCount = 0;

        // 3. [串行调度] 遍历并执行
        for (let i = 0; i < symbols.length; i++) {
            const { stock_code, stock_name } = symbols[i];
            res.write(`--------------------------------------------------\n`);
            res.write(`[进度 ${i + 1}/${symbols.length}] 正在处理: ${stock_name || stock_code} (${stock_code})...\n`);

            // 批量模式锁定 1y 历史和全周期，确保底库完整性
            const args = ['--symbol', stock_code, '--duration', '1y', '--periods', '1m', '5m', '15m', '30m', '60m', '120m', '240m', '1d', '1w', '1M'];
            if (stock_name) args.push('--name', stock_name);

            const csvPath = await runPythonTask(args, res);
            
            if (csvPath) {
                const ok = await ingestAndCleanup(csvPath, res);
                if (ok) successCount++;
            }

            // 4. [风控休眠] 串行间隔 3 秒，保护 API 账号
            if (i < symbols.length - 1) {
                res.write(`\n[风控] 正在等待 3 秒以规避 API 限流拦截...\n`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        // 5. [任务闭环] 记录成功的执行指纹
        if (successCount > 0) {
            await taskRepo.recordAction(user.id, 'SYNC_ALL', clientId);
        }

        res.write(`\n==================================================\n`);
        res.write(`[Node.js] 全局同步完成！成功: ${successCount}, 失败: ${symbols.length - successCount}\n`);

    } catch (error: any) {
        res.write(`\n[FATAL] 全局调度中断: ${error.message}\n`);
    } finally {
        res.end();
    }
};

/**
 * 处理 CSV 文件上传 (保留接口能力，尽管 UI 已隐藏)
 */
export const uploadData = async (req: Request, res: Response) => {
    const { stockCode } = req.body;
    const uploadedFile = (req as any).file;

    if (!uploadedFile) return res.status(400).send('没有接收到上传文件。');
    if (!stockCode) return res.status(400).send('必须指定股票/期货代码。');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();

    const args = ['--file', uploadedFile.path, '--file-symbol', stockCode];
    const csvPath = await runPythonTask(args, res);
    
    if (csvPath) {
        await ingestAndCleanup(csvPath, res);
    }
    
    res.write('\n[API] 上传导入任务结束。\n');
    res.end();
};
