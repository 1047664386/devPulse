import { create } from 'zustand';
import type { User } from '@/types/api';
import queryClient from '@/lib/queryClient';

// ─── localStorage 持久化辅助 ───────────────────────────────
// 解决页面刷新后 user 对象丢失（内存态）而 token 仍在（持久态）的不一致问题
// 导致 Header 显示"登录/注册"但 API 请求仍能通过认证的 Bug
// 使用 localStorage 而非 sessionStorage，确保同一域名下多标签页共享登录态

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveUser(user: User | null) {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
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
  // 初始化时从 localStorage 恢复，保证刷新后 user 不丢失
  user: loadUser(),
  isAuthenticated: !!localStorage.getItem('accessToken'),

  setUser: (user) => {
    saveUser(user);
    set({ user, isAuthenticated: !!user });
  },

  login: (user, accessToken, refreshToken) => {
    // 清理上一个用户（或同一用户旧会话）的查询缓存
    // 防止 staleTime 内的旧数据（如 sessions、notifications）残留到新会话
    queryClient.clear();
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    saveUser(user);
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    // 清理所有查询缓存，避免登出后残留数据（设备列表、通知等）
    queryClient.clear();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
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

// ─── 跨标签页同步 ─────────────────────────────────────────
// 当一个标签页登出（清除 localStorage），其他标签页通过 storage 事件感知到变化，
// 自动同步状态并提示用户。这是 GitHub / Notion 等产品的标准做法。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    const store = useAuthStore.getState();
    // accessToken 被移除 = 另一个标签页执行了登出
    if (e.key === 'accessToken' && !e.newValue) {
      queryClient.clear();
      store.setUser(null);
      alert('登录态已过期，请重新登录');
      window.location.href = '/login';
    }
    // user 对象被其他标签页更新（如修改了个人资料）
    if (e.key === 'user' && e.newValue) {
      try {
        const user = JSON.parse(e.newValue) as User;
        store.setUser(user);
      } catch {
        // 忽略解析失败
      }
    }
  });
}
