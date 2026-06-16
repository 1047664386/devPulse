import { create } from 'zustand';
import type { User } from '@/types/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!sessionStorage.getItem('accessToken'),

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  login: (user, accessToken, refreshToken) => {
    sessionStorage.setItem('accessToken', accessToken);
    sessionStorage.setItem('refreshToken', refreshToken);
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),
}));
