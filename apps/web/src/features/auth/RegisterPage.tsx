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

const registerSchema = z
  .object({
    email: z.string().email('请输入有效的邮箱'),
    username: z.string().min(3, '至少 3 个字符').max(20).regex(/^[a-zA-Z0-9_]+$/, '仅支持字母数字下划线'),
    displayName: z.string().min(2, '至少 2 个字符').max(30),
    password: z.string().min(8, '至少 8 位').regex(/[A-Z]/, '需包含大写字母').regex(/[a-z]/, '需包含小写字母').regex(/[0-9]/, '需包含数字'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    setError('');
    try {
      const { confirmPassword: _, ...payload } = data;
      const res = await api.post<{ data: AuthResponse }>('/auth/register', payload);
      const { user, accessToken, refreshToken } = res.data.data;
      login(user, accessToken, refreshToken);
      navigate('/');
    } catch (err) {
      const apiErr = getApiError(err);
      setError(apiErr?.message || '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">创建账号</h1>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="邮箱" type="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
        <Input label="用户名" placeholder="cooldev" error={errors.username?.message} {...register('username')} />
        <Input label="昵称" placeholder="Cool Developer" error={errors.displayName?.message} {...register('displayName')} />
        <Input label="密码" type="password" placeholder="至少 8 位，含大小写和数字" error={errors.password?.message} {...register('password')} />
        <Input label="确认密码" type="password" placeholder="再次输入密码" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        <Button type="submit" className="w-full" loading={loading}>
          注册
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        已有账号？{' '}
        <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
          登录
        </Link>
      </p>
    </>
  );
}
