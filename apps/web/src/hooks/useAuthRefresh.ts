import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/api-services';

/**
 * 认证状态后台刷新 Hook（Stale-While-Revalidate 模式）
 *
 * 业内标准做法（GitHub / Vercel / Linear 均采用）：
 * 1. localStorage 缓存 user 对象 → 页面刷新瞬间 UI 即可渲染，无闪烁
 * 2. App 启动后静默调用 GET /auth/me → 获取服务端最新用户数据
 * 3. 成功 → 用新数据覆盖 store + localStorage 缓存
 * 4. 失败（401）→ axios 拦截器自动尝试 refresh token，
 *    如果 refresh 也失败 → clearAuth() 跳转登录页
 *
 * 覆盖的安全场景：
 * - 管理员修改了用户角色 / 封禁了账号
 * - 用户在其他设备修改了个人资料
 * - token 被服务端主动吊销（修改密码后全部下线）
 *
 * 使用位置：MainLayout、AdminLayout 等顶层布局组件
 */
export function useAuthRefresh() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);

  const { data } = useQuery({
    queryKey: ['auth-me'],
    queryFn: authApi.getMe,
    enabled: isAuthenticated, // 仅在有 token 时发起
    staleTime: 1000 * 60 * 5, // 5 分钟内不重复请求（避免 SPA 内路由切换重复触发）
    retry: false,              // 401 由 axios 拦截器处理 token 刷新，Query 不自行重试
  });

  // 服务端返回最新 user → 覆盖本地缓存
  // 必须在 useEffect 中更新状态，不能在渲染期间直接调用 setUser
  useEffect(() => {
    if (data) {
      setUser(data);
    }
  }, [data, setUser]);
}
