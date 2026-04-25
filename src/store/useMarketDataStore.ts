"use client";

import { create } from 'zustand';
import { API_URL } from '@/config/constants';
import { useAuthStore } from './useAuthStore';

type Symbol = {
  value: string;
  label: string;
};

type MarketDataState = {
  availableSymbols: Symbol[];
  isLoading: boolean;
  error: string | null;
  fetchSymbols: () => void;
};

export const useMarketDataStore = create<MarketDataState>((set, get) => ({
  availableSymbols: [],
  isLoading: false,
  error: null,
  fetchSymbols: () => {
    const token = useAuthStore.getState().token;
    if (get().isLoading) return;

    if (!token) {
        set({
            error: "用户未认证，无法加载数据。",
            isLoading: false,
            availableSymbols: [],
        });
        return;
    }

    set({ isLoading: true, error: null });

    fetch(`${API_URL}/api/v1/market-data/symbols`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (!res.ok) {
        return res.json().catch(() => ({ message: "获取品种列表失败" })).then(errorBody => {
            throw new Error(errorBody.message || '获取品种列表时发生未知错误');
        });
      }
      return res.json();
    })
    .then((fetchedSymbols: { stock_code: string, stock_name: string | null }[]) => {
      if (!Array.isArray(fetchedSymbols)) {
        throw new Error("API返回的品种列表格式不正确。");
      }
      const allSymbols = fetchedSymbols.map(s => ({ 
        value: s.stock_code, 
        label: s.stock_name ? `${s.stock_name} (${s.stock_code})` : s.stock_code 
      })).sort((a, b) => a.label.localeCompare(b.label));
      set({ availableSymbols: allSymbols, isLoading: false });
    })
    .catch((error: any) => {
      const errorMessage = String(error.message).includes('Failed to fetch') || String(error.message).includes('ERR_CONNECTION_REFUSED')
        ? "无法连接到后端API服务。请确保 'nodejs_api' 服务正在 http://localhost:3001 运行，并且没有被防火墙阻止。"
        : (error.message || "获取品种列表时发生未知错误");
      
      set({ error: errorMessage, isLoading: false, availableSymbols: [] });
    });
  },
}));