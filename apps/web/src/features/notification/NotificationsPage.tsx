import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { notificationApi } from '@/lib/api-services';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificationType } from '@/types/api';

const typeIcons: Record<NotificationType, string> = {
  ARTICLE_LIKED: '❤️',
  COMMENT_RECEIVED: '💬',
  COMMENT_REPLIED: '↩️',
  COMMENT_LIKED: '❤️',
  USER_FOLLOWED: '👤',
  ARTICLE_PUBLISHED: '📝',
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationApi.list(),
  });

  const notifications = data?.data ?? [];
  const unreadCount = data?.meta?.unreadCount ?? 0;

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllRead = () => {
    markAllReadMutation.mutate();
  };

  const markRead = (id: string) => {
    markReadMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-gray-400 text-center py-12">加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-700" />
          <h1 className="text-xl font-bold text-gray-900">通知</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4 mr-1" />
            全部已读
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">暂无通知</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-4 transition ${!n.isRead ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
              onClick={() => markRead(n.id)}
            >
              <Link to={`/users/${n.actor.id}`} className="flex-shrink-0">
                <Avatar src={n.actor.avatar} name={n.actor.displayName} size="md" />
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">
                  <span className="mr-1">{typeIcons[n.type]}</span>
                  <Link to={`/users/${n.actor.id}`} className="font-medium hover:text-blue-600">
                    {n.actor.displayName}
                  </Link>{' '}
                  {n.content}
                </p>
                <p className="text-xs text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
              </div>
              {!n.isRead && (
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
