import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  // Redirect already authenticated users to home
  if (isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <Link to="/" className="mb-8 text-2xl font-bold text-blue-600">
        DevPulse
      </Link>
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        {children}
      </div>
      <p className="mt-6 text-xs text-gray-400">
        DevPulse &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
