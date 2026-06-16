import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-services';
import type { RoleListItem } from '@/types/api';
import { ShieldPlus, Plus, Trash2, Users, AlertTriangle } from 'lucide-react';

export default function RolesManagePage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const { data: roles, isLoading } = useQuery({
    queryKey: ['admin-all-roles'],
    queryFn: adminApi.listRoles,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      adminApi.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roles-permissions'] });
      setNewName('');
      setNewDesc('');
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => adminApi.deleteRole(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roles-permissions'] });
    },
  });

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createMutation.mutate({
      name: trimmed,
      description: newDesc.trim() || undefined,
    });
  };

  const handleDelete = (role: RoleListItem) => {
    if (role.isSystem) return;
    const userCount = role._count?.users ?? 0;
    const msg =
      userCount > 0
        ? `确定删除角色 "${role.name}"？\n\n该角色当前有 ${userCount} 个用户，删除后这些用户将失去此角色关联的权限。`
        : `确定删除角色 "${role.name}"？`;
    if (confirm(msg)) {
      deleteMutation.mutate(role.id);
    }
  };

  const systemRoles = (roles ?? []).filter((r) => r.isSystem);
  const customRoles = (roles ?? []).filter((r) => !r.isSystem);

  if (isLoading) {
    return <p className="text-sm text-gray-400 text-center py-12">加载中...</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldPlus className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">角色管理</h2>
          <span className="text-sm text-gray-400">
            管理系统角色，创建自定义角色或删除不再需要的角色
          </span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建角色
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <h3 className="text-sm font-medium text-indigo-900 mb-3">创建新角色</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">角色名称 *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                placeholder="例如 MODERATOR"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">描述</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="可选，简要说明角色用途"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createMutation.isPending}
                className="text-sm px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setNewName('');
                  setNewDesc('');
                }}
                className="text-sm px-4 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
          {createMutation.isError && (
            <p className="mt-2 text-xs text-red-600">
              创建失败：{(createMutation.error as Error)?.message ?? '未知错误'}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            新创建的角色默认无任何权限，创建后请前往"权限管理"页面为其分配权限。
          </p>
        </div>
      )}

      {/* System roles */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
          系统角色（{systemRoles.length}）
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {systemRoles.map((role) => (
            <div
              key={role.id}
              className="bg-white rounded-lg border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900">{role.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  系统
                </span>
              </div>
              {role.description && (
                <p className="text-xs text-gray-500 mb-3">{role.description}</p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Users className="w-3.5 h-3.5" />
                <span>{role._count?.users ?? 0} 个用户</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom roles */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
          自定义角色（{customRoles.length}）
        </h3>
        {customRoles.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <ShieldPlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">暂无自定义角色</p>
            <p className="text-xs text-gray-300 mt-1">
              点击上方"新建角色"按钮创建自定义角色
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">角色名称</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">描述</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-500">用户数</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">创建时间</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customRoles.map((role) => {
                  const userCount = role._count?.users ?? 0;
                  return (
                    <tr key={role.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{role.name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {role.description || (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {userCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            <Users className="w-3 h-3" />
                            {userCount}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(role.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(role)}
                          disabled={deleteMutation.isPending}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Warning about deleting roles with users */}
        {customRoles.some((r) => (r._count?.users ?? 0) > 0) && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              部分自定义角色下仍有用户。删除角色后，相关用户将失去该角色关联的权限。请确认后再操作。
            </p>
          </div>
        )}
      </div>

      {/* Error messages */}
      {deleteMutation.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          删除失败：{(deleteMutation.error as Error)?.message ?? '未知错误'}
        </div>
      )}
    </div>
  );
}
