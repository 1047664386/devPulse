import { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useAuthRefresh } from '@/hooks/useAuthRefresh';
import { hasRole, canCreateArticle } from '@/types/api';
import { notificationApi, authApi } from '@/lib/api-services';
import { cn, resolveUploadUrl } from '@/lib/utils';
import {
  Bell,
  BookMarked,
  Feather,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  User as UserIcon,
  X,
} from 'lucide-react';

function NavLink({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={cn(
        'px-3 py-2 text-sm font-medium rounded-md transition-colors',
        active ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export default function MainLayout() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // 认证状态后台刷新：本地缓存先渲染 UI，后台静默拉取最新用户数据
  useAuthRefresh();

  const { data: unreadData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: notificationApi.unreadCount,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const handleLogout = async () => {
    // 先通知后端单设备下线，再清除本地状态
    const refreshToken = sessionStorage.getItem('refreshToken');
    try {
      await authApi.logout(refreshToken ?? undefined);
    } catch {
      // 即使后端不可达也要清除本地状态
    }
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Left */}
          <div className="flex items-center gap-4">
            <Link to="/" className="text-xl font-bold text-blue-600">
              DevPulse
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/">首页</NavLink>
              <NavLink to="/tags">标签</NavLink>
            </nav>
          </div>

          {/* Center - Search */}
          <div className="hidden md:flex flex-1 max-w-md mx-6">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索文章..."
                className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-100 border border-transparent rounded-full focus:bg-white focus:border-blue-300 focus:outline-none transition"
                onFocus={() => navigate('/search')}
              />
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <>
                {canCreateArticle(user) && (
                  <Link
                    to="/editor"
                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition"
                  >
                    <Feather className="w-4 h-4" />
                    写文章
                  </Link>
                )}
                <Link to="/notifications" className="relative p-2 text-gray-500 hover:text-gray-700 transition">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </Link>
                {/* Profile dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 transition"
                  >
                    {user.avatar ? (
                      <img src={resolveUploadUrl(user.avatar)} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-blue-600" />
                      </div>
                    )}
                  </button>
                  {profileOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                        <div className="px-3 py-2 border-b border-gray-100">
                          <p className="text-sm font-medium text-gray-900">{user.displayName}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                        <Link
                          to={`/users/${user.id}`}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setProfileOpen(false)}
                        >
                          <UserIcon className="w-4 h-4" /> 个人主页
                        </Link>
                        <Link
                          to="/bookmarks"
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setProfileOpen(false)}
                        >
                          <BookMarked className="w-4 h-4" /> 我的收藏
                        </Link>
                        <Link
                          to="/settings"
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setProfileOpen(false)}
                        >
                          <Settings className="w-4 h-4" /> 设置
                        </Link>
                        {hasRole(user, 'ADMIN') && (
                          <Link
                            to="/admin"
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => setProfileOpen(false)}
                          >
                            <Shield className="w-4 h-4" /> 管理后台
                          </Link>
                        )}
                        <hr className="my-1 border-gray-100" />
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="w-4 h-4" /> 退出登录
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
                >
                  <LogIn className="w-4 h-4" />
                  登录
                </Link>
                <Link
                  to="/register"
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition"
                >
                  注册
                </Link>
              </div>
            )}
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 text-gray-500 hover:text-gray-700"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-200 px-4 py-3 space-y-1">
            <NavLink to="/">首页</NavLink>
            <NavLink to="/tags">标签</NavLink>
            <NavLink to="/search">搜索</NavLink>
            {isAuthenticated && user && canCreateArticle(user) && (
              <NavLink to="/editor">写文章</NavLink>
            )}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-gray-400">
          DevPulse &copy; {new Date().getFullYear()} &mdash; 全栈学习项目
        </div>
      </footer>
    </div>
  );
}
