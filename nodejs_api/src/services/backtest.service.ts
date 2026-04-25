/**
 * @fileoverview 异步回测服务引擎。
 * 直接将 DuckDB 路径传给 Python，由 Python 自主读取数据。
 * 在 Python 进程运行期间，Node.js 主动释放 DuckDB 文件锁，
 * 解决 Windows 下多进程文件锁冲突问题。
 */
import { DatabaseFactory } from '../database/factory';
import type { ITaskRepository } from '../database/repositories/interfaces';
import { DuckDBKlineRepository } from '../database/repositories/duckdb.kline.repository';
import { spawn } from 'child_process';
import path from 'path';

const taskRepo: ITaskRepository = DatabaseFactory.getTaskRepository();

const rawDbPath = process.env.DUCKDB_PATH || '../local_data/alphascan.duckdb';
const DUCKDB_PATH = path.resolve(process.cwd(), rawDbPath);

class BacktestService {

    public async run(
        taskId: string,
        stockCode: string,
        period: string,
        conditions: any,
        preset?: string,
        startTime?: string,
        endTime?: string,
    ): Promise<void> {
        try {
            await taskRepo.updateTaskStatus(taskId, 'RUNNING');

            const pythonPath = process.env.PYTHON_EXECUTABLE
                || process.env.PYTHON_PATH
                || 'python';
            const scriptPath = path.resolve(__dirname, '../../../python_engine/backtest.py');

            const args: string[] = [
                scriptPath,
                '--db_path', DUCKDB_PATH,
                '--stock_code', stockCode,
                '--period', period,
                '--conditions', JSON.stringify(conditions || {}),
            ];

            if (preset && preset.trim() !== '') args.push('--preset', preset.trim());
            if (startTime && startTime.trim() !== '') args.push('--start_time', startTime.trim());
            if (endTime && endTime.trim() !== '') args.push('--end_time', endTime.trim());

            // ── 关键：释放 Node.js 的 DuckDB 文件锁，让 Python 能打开文件 ──
            await DuckDBKlineRepository.releaseForPython();

            let result: any;
            try {
                result = await new Promise<any>((resolve, reject) => {
                    const child = spawn(pythonPath, args);
                    let stdoutData = '';
                    let stderrData = '';
                    let timedOut = false;

                    // 全市场扫参场景耗时更长，超时保护设为 30 分钟
                    const TIMEOUT_MS = 30 * 60 * 1000;
                    const timer = setTimeout(() => {
                        timedOut = true;
                        child.kill('SIGKILL');
                        reject(new Error(
                            `全市场回测超时 (${TIMEOUT_MS / 60000} 分钟)，已强制终止。` +
                            `请缩小标的范围或时间范围。`
                        ));
                    }, TIMEOUT_MS);

                    // Python 不通过 stdin 接收数据，主动关闭防止子进程挂起
                    child.stdin.end();

                    child.stdout.on('data', (data: Buffer) => { stdoutData += data.toString(); });
                    child.stderr.on('data', (data: Buffer) => { stderrData += data.toString(); });

                    child.on('close', (code: number | null) => {
                        clearTimeout(timer);

                        if (timedOut) return;

                        if (code !== 0) {
                            try {
                                const parsed = JSON.parse(stdoutData.trim());
                                if (parsed.error) return reject(new Error(parsed.error));
                            } catch (_) { /* stdout 不是合法 JSON */ }
                            return reject(new Error(
                                `Python process exited with code ${code}\n` +
                                `Stdout: ${stdoutData}\nStderr: ${stderrData}`
                            ));
                        }

                        try {
                            const parsed = JSON.parse(stdoutData.trim());
                            if (parsed.error) return reject(new Error(parsed.error));
                            resolve(parsed);
                        } catch (e) {
                            reject(new Error(
                                `Failed to parse Python output. Error: ${e}\nOutput: ${stdoutData}`
                            ));
                        }
                    });

                    child.on('error', (err: Error) => {
                        clearTimeout(timer);
                        reject(new Error(`无法启动 Python 进程: ${err.message}`));
                    });
                });
            } finally {
                // ── 确保每一次 releaseForPython 都有且仅有一次对应的 reconnect ──
                DuckDBKlineRepository.reconnect();
            }

            await taskRepo.updateTaskStatus(taskId, 'COMPLETED', result);
            console.log(`[BacktestService] Task ${taskId} completed via Direct DB Read.`);

        } catch (error: any) {
            console.error(`[BacktestService] Task ${taskId} failed:`, error);
            await taskRepo.updateTaskStatus(taskId, 'FAILED', { error: error.message });
        }
    }

    public async getSignalDetails(
        taskId: string,
        limit: number,
        offset: number,
    ): Promise<{ signals: any[]; total: number }> {
        const task = await taskRepo.getTaskById(taskId);
        if (!task || task.status !== 'COMPLETED') {
            return { signals: [], total: 0 };
        }
        const allSignals: any[] = task.result_summary?.signal_details ?? [];
        const total = task.result_summary?.total_signals ?? allSignals.length;
        const page = allSignals.slice(offset, offset + limit);
        return { signals: page, total };
    }
}

export const backtestService = new BacktestService();