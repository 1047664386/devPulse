import { QueryClient } from '@tanstack/react-query';

/**
 * 全局 QueryClient 单例
 *
 * 从 App.tsx 中抽出为独立模块，使 auth store 等非组件代码也能
 * 在登出/登入时调用 queryClient.clear() 清理缓存，
 * 避免切换账号后旧查询数据残留导致页面显示不一致。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default queryClient;
