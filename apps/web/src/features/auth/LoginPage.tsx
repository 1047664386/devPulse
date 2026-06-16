import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import api, { getApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { AuthResponse } from '@/types/api';

const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(1, '请输入密码'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ data: AuthResponse }>('/auth/login', data);
      const { user, accessToken, refreshToken } = res.data.data;
      login(user, accessToken, refreshToken);
      navigate('/');
    } catch (err) {
      const apiErr = getApiError(err);
      setError(apiErr?.message || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">欢迎回来</h1>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="邮箱" type="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
        <Input label="密码" type="password" placeholder="输入密码" error={errors.password?.message} {...register('password')} />
        <Button type="submit" className="w-full" loading={loading}>
          登录
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        还没有账号？{' '}
        <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
          立即注册
        </Link>
      </p>
    </>
  );
}
