import { create } from 'zustand';
import type { User } from '@/types/api';

// ─── sessionStorage 持久化辅助 ───────────────────────────────
// 解决页面刷新后 user 对象丢失（内存态）而 token 仍在（持久态）的不一致问题
// 导致 Header 显示"登录/注册"但 API 请求仍能通过认证的 Bug

function loadUser(): User | null {
  try {
    const raw = sessionStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveUser(user: User | null) {
  if (user) {
    sessionStorage.setItem('user', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('user');
  }
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // 初始化时从 sessionStorage 恢复，保证刷新后 user 不丢失
  user: loadUser(),
  isAuthenticated: !!sessionStorage.getItem('accessToken'),

  setUser: (user) => {
    saveUser(user);
    set({ user, isAuthenticated: !!user });
  },

  login: (user, accessToken, refreshToken) => {
    sessionStorage.setItem('accessToken', accessToken);
    sessionStorage.setItem('refreshToken', refreshToken);
    saveUser(user);
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    saveUser(null);
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updates) =>
    set((state) => {
      const updated = state.user ? { ...state.user, ...updates } : null;
      saveUser(updated);
      return { user: updated };
    }),
}));
