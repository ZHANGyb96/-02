
"use client";

import { create } from 'zustand';
import type { StrategyFormValues } from '@/app/dashboard/backtest/strategy-builder';
import { API_URL } from '@/config/constants';
import { useAuthStore } from './useAuthStore';

export type Task = {
  task_id: string;
  user_id: number;
  strategy_name: string;
  strategy_params: any;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  result_summary: any;
  created_at: string;
  completed_at: string | null;
};

type BacktestTaskState = {
  taskId: string | null;
  task: Task | null;
  isSubmitting: boolean;
  error: string | null;
};

type BacktestTaskActions = {
  submitTask: (data: StrategyFormValues) => Promise<void>;
  reset: () => void;
};

const initialState: BacktestTaskState = {
  taskId: null,
  task: null,
  isSubmitting: false,
  error: null,
};

let pollTimeout: NodeJS.Timeout | null = null;


export const useBacktestTaskStore = create<BacktestTaskState & BacktestTaskActions>((set, get) => ({
  ...initialState,

  reset: () => {
    if (pollTimeout) clearTimeout(pollTimeout);
    set(initialState);
  },

  submitTask: async (data) => {
    if (get().isSubmitting) return;

    const token = useAuthStore.getState().token;
    if (!token) {
        set({ error: "用户未登录，无法提交任务。" });
        return;
    }

    if (!data.conditions || data.conditions.length === 0) {
        set({ error: "请至少添加一个策略条件。" });
        return;
    }

    get().reset();
    set({ isSubmitting: true, error: null });

    try {
        const isPreset = data.preset && data.preset !== 'custom';
        const periodForApi = isPreset ? data.period || '1d' : (data.conditions?.[0]?.period || '1d');

        const payload: any = {
            stockCode: data.stockCode,
            period: periodForApi, 
            strategyName: data.strategyName,
            startTime: data.startTime || undefined,
            endTime: data.endTime || undefined
        };

        if (isPreset) {
            payload.preset = data.preset;
        } else {
            const parsedConditions = data.conditions?.map(c => {
                let leftStr = c.left;
                let rightStr = c.rightValue;

                // 核心修复：如果子条件周期与主周期不同，追加多周期后缀供 Python 解析
                if (c.period && c.period !== periodForApi) {
                    leftStr = `${c.left}_${c.period}`;
                    if (c.rightType === 'line') {
                        rightStr = `${c.rightValue}_${c.period}`;
                    }
                }

                const finalRightValue = c.rightType === 'value' ? Number(c.rightValue) : rightStr;
                return { left: leftStr, op: c.operator, right: finalRightValue };
            }) || [];
            payload.conditions = {
                logic: data.logic || 'AND',
                conditions: parsedConditions
            };
        }

        const response = await fetch(`${API_URL}/api/v1/backtest/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              useAuthStore.getState().logout();
            }
            throw new Error(result.message || "提交任务失败");
        }

        set({ taskId: result.taskId });
        pollTask(result.taskId, 0);

    } catch (error: any) {
        if (error.message.includes('Failed to fetch')) {
          set({ error: '无法连接到后端服务。请确认 Node.js API 服务 (在 nodejs_api 目录中) 正在运行。' });
        } else {
          set({ error: error.message || "与服务器通信时发生错误。" });
        }
    } finally {
        set({ isSubmitting: false });
    }
  },
}));


// --- Polling Logic ---

async function pollTask(taskId: string, attempt: number) {
    const token = useAuthStore.getState().token;
    if (!token) return;

    // Stop polling if the task has been reset
    if (useBacktestTaskStore.getState().taskId !== taskId) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/v1/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            useAuthStore.getState().logout();
            return;
          }
          const errorBody = await res.json();
          throw new Error(errorBody.message || '获取任务状态失败');
        }

        const data: Task = await res.json();
        useBacktestTaskStore.setState({ task: data });

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          return;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        pollTimeout = setTimeout(() => pollTask(taskId, attempt + 1), delay);

    } catch (err: any) {
        useBacktestTaskStore.setState({ error: err.message });
    }
}
