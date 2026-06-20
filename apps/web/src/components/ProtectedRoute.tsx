import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** 允许访问的角色列表，不传则只检查登录状态 */
  requiredRoles?: string[];
}

export default function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 角色守卫：用户不具备所需角色时跳转到首页
  if (requiredRoles && user) {
    const userRoles = user.roles.map((ur) => ur.role.name);
    const hasRequired = requiredRoles.some((r) => userRoles.includes(r));
    if (!hasRequired) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
