import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';
import HomePage from '@/features/article/HomePage';
import ArticleDetailPage from '@/features/article/ArticleDetailPage';
import ArticleEditorPage from '@/features/article/ArticleEditorPage';
import TagsPage from '@/features/article/TagsPage';
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
            <Route path="editor" element={<ProtectedRoute><ArticleEditorPage /></ProtectedRoute>} />
            <Route path="editor/:id" element={<ProtectedRoute><ArticleEditorPage /></ProtectedRoute>} />
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
