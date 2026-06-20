import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useAuthRefresh } from '@/hooks/useAuthRefresh';
import { hasRole } from '@/types/api';
import { BarChart3, FileText, Tags, Users, Shield, ShieldPlus } from 'lucide-react';

const navItems = [
  { to: '/admin', icon: BarChart3, label: '仪表盘', end: true },
  { to: '/admin/users', icon: Users, label: '用户管理' },
  { to: '/admin/articles', icon: FileText, label: '文章管理' },
  { to: '/admin/tags', icon: Tags, label: '标签管理' },
  { to: '/admin/roles', icon: ShieldPlus, label: '角色管理' },
  { to: '/admin/permissions', icon: Shield, label: '权限管理' },
];

export default function AdminLayout() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();

  // 认证状态后台刷新：与 MainLayout 共用同一套 SWR 逻辑
  useAuthRefresh();

  // Redirect non-authenticated or non-admin users
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasRole(user, 'ADMIN')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">管理后台</h1>
      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-48 flex-shrink-0 space-y-1">
          {navItems.map((item) => {
            const active = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  active ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
