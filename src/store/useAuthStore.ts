"use client"

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type User = {
    id: number;
    email: string;
    role: 'user' | 'admin'; // 新增
};

type AuthState = {
    user: User | null;
    token: string | null;
    isInitialized: boolean;
};

type AuthActions = {
    login: (token: string, user: User) => void;
    logout: () => void;
};

const initialState: AuthState = {
    user: null,
    token: null,
    isInitialized: false,
};

export const useAuthStore = create<AuthState & AuthActions>()(
    persist(
        (set) => ({
            ...initialState,
            login: (token, user) => set({ token, user }),
            logout: () => set({ user: null, token: null }), 
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => localStorage),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.isInitialized = true;
                }
            },
        }
    )
);
