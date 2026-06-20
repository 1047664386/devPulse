import axios from 'axios';
import type { ApiError, ApiResponse } from '@/types/api';
import queryClient from '@/lib/queryClient';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // 自动携带 HttpOnly Cookie（refreshToken）
});

// Attach accessToken to every request
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * 响应拦截器
 *
 * 新格式下，成功和大部分业务错误都走 HTTP 200，通过 code 字段区分。
 * 但 401（未认证/令牌过期）和 500（系统崩溃）仍然走 HTTP 状态码，
 * 因为 401 需要触发令牌刷新逻辑，500 是基础设施级别的错误。
 */
api.interceptors.response.use(
  (res) => {
    // HTTP 200 响应：检查业务 code
    const body = res.data as ApiResponse<unknown>;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      // 业务错误：code !== 0，转为 rejected promise
      return Promise.reject({
        ...res,
        data: body,
        isBusinessError: true,
      });
    }
    return res;
  },
  async (error) => {
    const original = error.config;

    // 只处理 401 的令牌刷新
    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then(() => api(original));
    }

    original._retry = true;
    isRefreshing = true;

    try {
      // 分层兼容：Cookie 模式下浏览器自动携带 refreshToken，body 作为兜底
      const refreshToken = sessionStorage.getItem('refreshToken');
      const { data } = await axios.post('/api/v1/auth/refresh', 
        refreshToken ? { refreshToken } : {},
        { withCredentials: true },
      );
      const payload = data.data || data;
      sessionStorage.setItem('accessToken', payload.accessToken);
      // refreshToken 可能从 body 更新（兼容模式），Cookie 模式下由浏览器自动管理
      if (payload.refreshToken) {
        sessionStorage.setItem('refreshToken', payload.refreshToken);
      }
      processQueue(null);
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError);
      clearAuth();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// Auto-refresh on 401
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(undefined)));
  pendingQueue = [];
}

function clearAuth() {
  queryClient.clear();
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('user');
  window.location.href = '/login';
}

/**
 * 从错误响应中提取业务错误信息
 *
 * 用法：
 *   try { await api.post(...) }
 *   catch (e) {
 *     const err = getApiError(e);
 *     if (err) toast(err.message); // "邮箱或密码错误"
 *   }
 */
export function getApiError(error: unknown): ApiError | null {
  // 业务错误（HTTP 200 + code !== 0）
  if (
    error &&
    typeof error === 'object' &&
    'isBusinessError' in error &&
    (error as any).data
  ) {
    const body = (error as any).data;
    return {
      code: body.code,
      message: body.message,
      details: body.details,
      requestId: body.requestId,
    };
  }

  // HTTP 级别错误（401/500 等）
  if (axios.isAxiosError(error) && error.response?.data) {
    const body = error.response.data;
    if (typeof body.code === 'number') {
      return {
        code: body.code,
        message: body.message,
        details: body.details,
        requestId: body.requestId,
      };
    }
  }

  return null;
}

/**
 * 判断是否是特定的业务错误码
 *
 * 用法：
 *   if (isErrorCode(error, ErrEmailRegistered)) { ... }
 */
export function isErrorCode(error: unknown, code: number): boolean {
  const apiError = getApiError(error);
  return apiError?.code === code;
}

export default api;
