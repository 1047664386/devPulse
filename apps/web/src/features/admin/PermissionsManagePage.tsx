import { useState, useCallback, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-services';
import type { RoleDetail } from '@/types/api';
import { Shield, Save, RotateCcw, Check, X } from 'lucide-react';

interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string | null;
}

const ROLE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  READER: { label: '读者', color: 'bg-gray-100 text-gray-700', desc: '仅可浏览内容和发表自己的内容' },
  AUTHOR: { label: '作者', color: 'bg-blue-100 text-blue-700', desc: '可发布和管理自己的文章' },
  ADMIN: { label: '管理员', color: 'bg-purple-100 text-purple-700', desc: '拥有全部权限' },
};

const RESOURCE_LABELS: Record<string, string> = {
  article: '文章',
  comment: '评论',
  tag: '标签',
  user: '用户',
  role: '角色',
  permission: '权限',
  admin: '管理后台',
};

export default function PermissionsManagePage() {
  const queryClient = useQueryClient();

  const { data: allPermissions, isLoading: loadingPerms } = useQuery({
    queryKey: ['admin-all-permissions'],
    queryFn: adminApi.getAllPermissions,
  });

  const { data: rolesData, isLoading: loadingRoles } = useQuery({
    queryKey: ['admin-roles-permissions'],
    queryFn: adminApi.getRolesWithPermissions,
  });

  // Local edit state: { roleId: Set<permId> }
  const [edits, setEdits] = useState<Record<string, Set<string>> | null>(null);
  const [savedRoleId, setSavedRoleId] = useState<string | null>(null);

  // Initialize edits from server data
  const initEdits = useCallback(() => {
    if (!rolesData) return;
    const map: Record<string, Set<string>> = {};
    for (const role of rolesData) {
      map[role.id] = new Set(role.permissions.map((p) => p.id));
    }
    setEdits(map);
  }, [rolesData]);

  // Start editing
  if (edits === null && rolesData) {
    initEdits();
  }

  const togglePermission = (roleId: string, permId: string) => {
    if (!edits) return;
    setEdits((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const set = new Set(next[roleId]);
      if (set.has(permId)) {
        set.delete(permId);
      } else {
        set.add(permId);
      }
      next[roleId] = set;
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
      adminApi.updateRolePermissions(roleId, permissionIds),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles-permissions'] });
      setSavedRoleId(vars.roleId);
      setTimeout(() => setSavedRoleId(null), 2000);
    },
  });

  const saveRole = (roleId: string) => {
    if (!edits) return;
    const permissionIds = [...edits[roleId]];
    saveMutation.mutate({ roleId, permissionIds });
  };

  const resetRole = (roleId: string) => {
    if (!rolesData) return;
    const original = rolesData.find((r) => r.id === roleId);
    if (!original) return;
    setEdits((prev) => {
      if (!prev) return prev;
      return { ...prev, [roleId]: new Set(original.permissions.map((p) => p.id)) };
    });
  };

  const hasChanges = (roleId: string): boolean => {
    if (!edits || !rolesData) return false;
    const original = rolesData.find((r) => r.id === roleId);
    if (!original) return false;
    const originalIds = new Set(original.permissions.map((p) => p.id));
    const editIds = edits[roleId];
    if (originalIds.size !== editIds.size) return true;
    for (const id of originalIds) {
      if (!editIds.has(id)) return true;
    }
    return false;
  };

  // Group permissions by resource
  const groupedPerms = (allPermissions ?? []).reduce<Record<string, Permission[]>>(
    (acc, p) => {
      if (!acc[p.resource]) acc[p.resource] = [];
      acc[p.resource].push(p);
      return acc;
    },
    {},
  );

  const isLoading = loadingPerms || loadingRoles;

  if (isLoading) {
    return <p className="text-sm text-gray-400 text-center py-12">加载中...</p>;
  }

  const roles = rolesData ?? [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-5 h-5 text-purple-600" />
        <h2 className="text-lg font-semibold text-gray-900">权限管理</h2>
        <span className="text-sm text-gray-400">
          为每个角色分配或取消权限，修改后点击保存生效
        </span>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {roles.map((role: RoleDetail) => {
          const meta = ROLE_LABELS[role.name] ?? { label: role.name, color: 'bg-gray-100 text-gray-700', desc: role.description ?? '' };
          const changed = hasChanges(role.id);
          return (
            <div
              key={role.id}
              className={`rounded-lg border p-4 ${changed ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                  {meta.label}
                </span>
                <span className="text-xs text-gray-400">
                  {edits?.[role.id]?.size ?? role.permissions.length} / {allPermissions?.length ?? 0}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{meta.desc}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => saveRole(role.id)}
                  disabled={!changed || saveMutation.isPending}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {savedRoleId === role.id ? (
                    <>
                      <Check className="w-3 h-3" /> 已保存
                    </>
                  ) : (
                    <>
                      <Save className="w-3 h-3" /> 保存
                    </>
                  )}
                </button>
                {changed && (
                  <button
                    onClick={() => resetRole(role.id)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> 重置
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Permission matrix */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-[40%]">权限</th>
              {roles.map((role: RoleDetail) => {
                const meta = ROLE_LABELS[role.name] ?? { label: role.name };
                return (
                  <th key={role.id} className="text-center px-4 py-3 font-medium text-gray-500 w-[20%]">
                    {meta.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedPerms).map(([resource, perms]) => (
              <Fragment key={resource}>
                {/* Resource group header */}
                <tr className="bg-gray-50/50">
                  <td
                    colSpan={roles.length + 1}
                    className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {RESOURCE_LABELS[resource] ?? resource}
                  </td>
                </tr>
                {perms.map((perm) => (
                  <tr key={perm.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">
                          {perm.resource}:{perm.action}
                        </code>
                        {perm.description && (
                          <span className="text-xs text-gray-400">{perm.description}</span>
                        )}
                      </div>
                    </td>
                    {roles.map((role: RoleDetail) => {
                      const checked = edits?.[role.id]?.has(perm.id) ?? false;
                      const isAdmin = role.name === 'ADMIN';
                      return (
                        <td key={role.id} className="text-center px-4 py-2.5">
                          <button
                            onClick={() => !isAdmin && togglePermission(role.id, perm.id)}
                            disabled={isAdmin}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
                              isAdmin
                                ? checked
                                  ? 'bg-purple-100 text-purple-600'
                                  : 'bg-gray-100 text-gray-300'
                                : checked
                                  ? 'bg-green-100 text-green-600 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-300 hover:bg-gray-200'
                            }`}
                            title={isAdmin ? '管理员默认拥有全部权限' : checked ? '点击取消' : '点击授予'}
                          >
                            {checked ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {saveMutation.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          保存失败：{(saveMutation.error as Error)?.message ?? '未知错误'}
        </div>
      )}
    </div>
  );
}
