"use client";

import { create } from 'zustand';
import { API_URL } from '@/config/constants';
import { useAuthStore } from './useAuthStore';

export type LicenseTier = 'BASIC' | 'PRO' | 'ELITE' | 'NONE';

type LicenseState = {
    isValid: boolean;
    tier: LicenseTier;
    expiresAt: string | null;
    isInitialized: boolean;
    checkStatus: () => Promise<void>;
    activate: (key: string) => Promise<{ success: boolean; message: string }>;
};

export const useLicenseStore = create<LicenseState>((set) => ({
    isValid: false,
    tier: 'NONE',
    expiresAt: null,
    isInitialized: false,

    /**
     * 检查当前登录账号的授权状态
     * 必须携带 Token 才能知道查询的是哪个账号
     */
    checkStatus: async () => {
        const token = useAuthStore.getState().token;
        
        // 如果没有 Token，说明未登录，直接设为基础版
        if (!token) {
            set({ isValid: false, tier: 'BASIC', isInitialized: true });
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/v1/license/status`, {
                headers: { 
                    'Authorization': `Bearer ${token}` 
                }
            });
            const data = await res.json();
            
            set({ 
                isValid: data.isValid, 
                tier: data.tier || 'BASIC', 
                expiresAt: data.expiresAt || null,
                isInitialized: true 
            });
        } catch (e) {
            // 发生错误（如后端断开）时也回退到 BASIC 确保 UI 不卡死
            set({ isValid: false, tier: 'BASIC', isInitialized: true });
        }
    },

    /**
     * 执行激活操作
     * 必须携带 Token 以便后端将激活码与当前账号绑定
     */
    activate: async (licenseKey: string) => {
        const token = useAuthStore.getState().token;
        
        if (!token) {
            return { success: false, message: '请先登录后再进行激活' };
        }

        try {
            const res = await fetch(`${API_URL}/api/v1/license/activate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ licenseKey })
            });
            const data = await res.json();
            
            if (res.ok) {
                set({ isValid: true, tier: data.tier, expiresAt: data.expiresAt });
                return { success: true, message: '激活成功' };
            }
            return { success: false, message: data.message || '激活失败' };
        } catch (e) {
            return { success: false, message: '无法连接激活服务' };
        }
    }
}));
