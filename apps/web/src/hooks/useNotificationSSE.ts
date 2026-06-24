import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';

/**
 * SSE 通知 Hook（fetch + ReadableStream 实现）
 *
 * 不使用 EventSource（不支持 Authorization Header），
 * 改用 fetch 流式读取 + 手动解析 SSE 协议，支持自定义 Header。
 *
 * - 新通知到达时自动刷新通知列表
 * - 未读数变化时自动更新角标
 * - token 刷新后自动重建连接
 * - 组件卸载时自动关闭连接
 */
export function useNotificationSSE() {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const { isAuthenticated } = useAuthStore();

  /**
   * 解析并处理单条 SSE 消息
   * SSE 格式: event:<type>\ndata:<json>\n\n
   */
  const handleMessage = useCallback(
    (raw: string) => {
      let eventType = 'message';
      let eventData = '';

      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          eventData += line.slice(5).trim();
        }
      }

      // 心跳消息，忽略
      if (eventData === 'heartbeat') return;

      try {
        const payload = JSON.parse(eventData) as {
          type: string;
          count?: number;
          data?: unknown;
        };

        if (payload.type === 'unread') {
          queryClient.setQueryData<{ count: number }>(['unread-count'], {
            count: payload.count ?? 0,
          });
        } else if (payload.type === 'notification') {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-count'] });
        }
      } catch {
        // 解析失败，忽略
      }
    },
    [queryClient],
  );

  /**
   * 建立 fetch SSE 连接
   * 用 ReadableStream 读取响应体，按 \n\n 分割事件
   */
  const connect = useCallback(
    async (signal: AbortSignal) => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      try {
        const res = await fetch('/api/v1/notifications/stream', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal,
        });

        if (!res.ok || !res.body) {
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE 协议用 \n\n 分隔事件
          const messages = buffer.split('\n\n');
          // 最后一段可能不完整，放回 buffer
          buffer = messages.pop() || '';

          for (const msg of messages) {
            if (msg.trim()) {
              handleMessage(msg);
            }
          }
        }
      } catch (err) {
        // 用户主动取消，静默返回
        if (err instanceof Error && err.name === 'AbortError') return;
        // 网络错误等，静默处理（后续会自动重连）
      }
    },
    [handleMessage],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const start = () => {
      if (stopped) return;
      const controller = new AbortController();
      abortRef.current = controller;

      connect(controller.signal).then(() => {
        // 连接正常关闭（非 abort），自动重连
        if (!stopped && !controller.signal.aborted) {
          reconnectTimer = setTimeout(start, 3000);
        }
      });
    };

    start();

    // 监听 token 刷新，重建连接
    const handleTokenUpdated = () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      start();
    };
    window.addEventListener('accessTokenUpdated', handleTokenUpdated);

    // 监听跨标签页 token 变化
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'accessToken' && e.newValue) {
        handleTokenUpdated();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      window.removeEventListener('accessTokenUpdated', handleTokenUpdated);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isAuthenticated, connect]);
}
