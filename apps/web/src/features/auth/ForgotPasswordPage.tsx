import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import api, { getApiError } from '@/lib/api';

const forgotSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = async (data: ForgotForm) => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', data);
      setSent(true);
    } catch (err) {
      const apiErr = getApiError(err);
      setError(apiErr?.message || '发送重置邮件失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <>
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full">
          <Mail className="w-6 h-6 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">邮件已发送</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          如果该邮箱已注册，重置密码邮件将在几分钟内送达。<br />
          请检查收件箱和垃圾邮件文件夹。
        </p>
        <p className="text-xs text-gray-400 text-center mb-4">
          链接有效期 30 分钟，过期后需重新申请。
        </p>
        <Link
          to="/login"
          className="block w-full text-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          返回登录
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">忘记密码</h1>
      <p className="text-sm text-gray-500 text-center mb-6">
        输入注册邮箱，我们将发送密码重置链接。
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="邮箱"
          type="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" className="w-full" loading={loading}>
          发送重置邮件
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
