import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-services';
import type { UserAdmin, RoleListItem } from '@/types/api';

export default function UsersManagePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => adminApi.listUsers({ search }),
  });

  const { data: allRoles } = useQuery({
    queryKey: ['admin-all-roles'],
    queryFn: adminApi.listRoles,
  });

  const users = data?.data ?? [];

  const updateRolesMutation = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
      adminApi.updateRoles(userId, roleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const banMutation = useMutation({
    mutationFn: ({ userId, action, reason }: { userId: string; action: 'ban' | 'unban'; reason?: string }) =>
      adminApi.ban(userId, { action, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const toggleUserRole = (userId: string, roleId: string, currentRoleIds: string[]) => {
    const newRoleIds = currentRoleIds.includes(roleId)
      ? currentRoleIds.filter((id) => id !== roleId)
      : [...currentRoleIds, roleId];
    updateRolesMutation.mutate({ userId, roleIds: newRoleIds });
  };

  const handleBan = (user: UserAdmin) => {
    const reason = prompt(`封禁用户 ${user.displayName}，请输入原因：`);
    if (reason !== null) {
      banMutation.mutate({ userId: user.id, action: 'ban', reason: reason || undefined });
    }
  };

  const handleUnban = (user: UserAdmin) => {
    if (confirm(`确定解封用户 ${user.displayName}？`)) {
      banMutation.mutate({ userId: user.id, action: 'unban' });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索用户..."
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-400">{users.length} 个用户</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-12">加载中...</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-500">用户</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">邮箱</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">角色</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">状态</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const userRoleIds = u.roles.map((ur) => ur.role.id);
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{u.displayName}</p>
                      <p className="text-xs text-gray-400">@{u.username}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {allRoles?.map((role: RoleListItem) => {
                          const isActive = userRoleIds.includes(role.id);
                          return (
                            <button
                              key={role.id}
                              onClick={() => toggleUserRole(u.id, role.id, userRoleIds)}
                              disabled={updateRolesMutation.isPending}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                isActive
                                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                              } disabled:opacity-50`}
                              title={role.description ?? role.name}
                            >
                              {role.name}
                            </button>
                          );
                        }) ?? <span className="text-xs text-gray-400">加载中...</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.isBanned ? (
                        <div>
                          <span className="text-xs text-red-600">已封禁</span>
                          {u.banReason && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[120px]" title={u.banReason}>
                              {u.banReason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-green-600">正常</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.isBanned ? (
                        <button
                          onClick={() => handleUnban(u)}
                          disabled={banMutation.isPending}
                          className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
                        >
                          解封
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBan(u)}
                          disabled={banMutation.isPending}
                          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          封禁
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
