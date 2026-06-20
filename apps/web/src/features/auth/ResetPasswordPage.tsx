import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle } from 'lucide-react';
import PasswordInput from '@/components/ui/PasswordInput';
import Button from '@/components/ui/Button';
import api, { getApiError } from '@/lib/api';

const resetSchema = z.object({
  newPassword: z
    .string()
    .min(8, '至少 8 位')
    .regex(/[A-Z]/, '需包含大写字母')
    .regex(/[a-z]/, '需包含小写字母')
    .regex(/[0-9]/, '需包含数字'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: '两次密码不一致',
  path: ['confirmPassword'],
});

type ResetForm = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  const onSubmit = async (data: ResetForm) => {
    if (!token) {
      setError('重置链接无效，缺少令牌参数');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword: data.newPassword,
      });
      setSuccess(true);
    } catch (err) {
      const apiErr = getApiError(err);
      setError(apiErr?.message || '重置密码失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 无 token 参数 → 提示用户从邮件链接进入
  if (!token && !success) {
    return (
      <>
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-4">重置密码</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          此页面需要通过邮件中的重置链接访问。<br />
          请前往邮箱点击重置链接。
        </p>
        <Link
          to="/forgot-password"
          className="block w-full text-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          申请重置链接
        </Link>
      </>
    );
  }

  if (success) {
    return (
      <>
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full">
          <CheckCircle className="w-6 h-6 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">密码已重置</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          你的密码已成功更新，所有设备已强制下线。<br />
          请使用新密码重新登录。
        </p>
        <Button
          className="w-full"
          onClick={() => navigate('/login')}
        >
          前往登录
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">设置新密码</h1>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <PasswordInput
          label="新密码"
          placeholder="至少 8 位，含大小写和数字"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <PasswordInput
          label="确认新密码"
          placeholder="再次输入新密码"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" className="w-full" loading={loading}>
          重置密码
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        记得密码？{' '}
        <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
          返回登录
        </Link>
      </p>
    </>
  );
}
