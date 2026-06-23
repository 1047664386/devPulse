import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from '@/lib/queryClient';
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';
import HomePage from '@/features/article/HomePage';
import ArticleDetailPage from '@/features/article/ArticleDetailPage';
import ArticleEditorPage from '@/features/article/ArticleEditorPage';
import MyDraftsPage from '@/features/article/MyDraftsPage';
import TagsPage from '@/features/article/TagsPage';
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import ForgotPasswordPage from '@/features/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/features/auth/ResetPasswordPage';
import UserProfilePage from '@/features/user/UserProfilePage';
import SettingsPage from '@/features/user/SettingsPage';
import BookmarksPage from '@/features/user/BookmarksPage';
import NotificationsPage from '@/features/notification/NotificationsPage';
import SearchPage from '@/features/search/SearchPage';
import AdminLayout from '@/features/admin/AdminLayout';
import DashboardPage from '@/features/admin/DashboardPage';
import UsersManagePage from '@/features/admin/UsersManagePage';
import ArticlesManagePage from '@/features/admin/ArticlesManagePage';
import TagsManagePage from '@/features/admin/TagsManagePage';
import RolesManagePage from '@/features/admin/RolesManagePage';
import ProtectedRoute from '@/components/ProtectedRoute';
import PermissionsManagePage from '@/features/admin/PermissionsManagePage';


// 所有import放最顶部...

// 模块全局变量，标记是否已注册监听，防止热更新重复绑定
let unhandledRejectionHandler: ((e: PromiseRejectionEvent) => void) | null = null;
let globalErrorHandler: ((e: ErrorEvent) => void) | null = null;

// 统一注册监听函数
function registerGlobalErrorListeners() {
  // 避免重复注册
  if (unhandledRejectionHandler || globalErrorHandler) return;

  unhandledRejectionHandler = (event) => {
    console.error('【全局异步未捕获异常】', event.reason, event.promise);
    event.preventDefault();
  };

  globalErrorHandler = (e) => {
    console.error('【全局同步运行时异常】', e.message, e.filename, e.lineno, e.error?.stack);
  };

  window.addEventListener('unhandledrejection', unhandledRejectionHandler);
  window.addEventListener('error', globalErrorHandler);
}

// 统一移除监听函数
function removeGlobalErrorListeners() {
  if (unhandledRejectionHandler) {
    window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    unhandledRejectionHandler = null;
  }
  if (globalErrorHandler) {
    window.removeEventListener('error', globalErrorHandler);
    globalErrorHandler = null;
  }
}

// 执行注册
registerGlobalErrorListeners();

// 关键：监听页面卸载/刷新时清除监听
window.addEventListener('beforeunload', removeGlobalErrorListeners);


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Auth routes (no main nav) */}
          <Route
            path="/login"
            element={
              <AuthLayout>
                <LoginPage />
              </AuthLayout>
            }
          />
          <Route
            path="/register"
            element={
              <AuthLayout>
                <RegisterPage />
              </AuthLayout>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <AuthLayout>
                <ForgotPasswordPage />
              </AuthLayout>
            }
          />
          <Route
            path="/reset-password"
            element={
              <AuthLayout>
                <ResetPasswordPage />
              </AuthLayout>
            }
          />

          {/* Admin routes (sidebar layout) */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersManagePage />} />
            <Route path="articles" element={<ArticlesManagePage />} />
            <Route path="tags" element={<TagsManagePage />} />
            <Route path="roles" element={<RolesManagePage />} />
            <Route path="permissions" element={<PermissionsManagePage />} />
          </Route>

          {/* Main routes (header + footer layout) */}
          <Route element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="article/:slug" element={<ArticleDetailPage />} />
            <Route path="editor" element={<ProtectedRoute requiredRoles={['ADMIN', 'AUTHOR']}><ArticleEditorPage /></ProtectedRoute>} />
            <Route path="editor/:id" element={<ProtectedRoute requiredRoles={['ADMIN', 'AUTHOR']}><ArticleEditorPage /></ProtectedRoute>} />
            <Route path="drafts" element={<ProtectedRoute requiredRoles={['ADMIN', 'AUTHOR']}><MyDraftsPage /></ProtectedRoute>} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="users/:id" element={<UserProfilePage />} />
            <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="bookmarks" element={<ProtectedRoute><BookmarksPage /></ProtectedRoute>} />
            <Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
            <Route path="search" element={<SearchPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
