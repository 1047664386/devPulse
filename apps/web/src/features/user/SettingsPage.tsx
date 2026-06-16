import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getRoleNames } from '@/types/api';
import { profileApi } from '@/lib/api-services';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarMutation = useMutation({
    mutationFn: (file: File) => profileApi.uploadAvatar(file),
    onSuccess: (data) => {
      updateUser({ avatar: data.url });
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: () => profileApi.update({ displayName, bio }),
    onSuccess: (data) => {
      updateUser({ displayName: data.displayName, bio: data.bio });
      setProfileMessage({ type: 'success', text: '已保存' });
      setTimeout(() => setProfileMessage(null), 2000);
    },
    onError: (err: Error) => {
      setProfileMessage({ type: 'error', text: err.message || '保存失败' });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => profileApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMessage({ type: 'success', text: '密码已修改' });
      setTimeout(() => setPwdMessage(null), 2000);
    },
    onError: (err: Error) => {
      setPwdMessage({ type: 'error', text: err.message || '密码修改失败' });
    },
  });

  if (!user) return null;

  const handleSaveProfile = () => {
    saveProfileMutation.mutate();
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      setPwdMessage({ type: 'error', text: '两次密码不一致' });
      return;
    }
    changePasswordMutation.mutate();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      avatarMutation.mutate(file);
    }
    // Reset so the same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">设置</h1>

      {/* Profile section */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">个人资料</h2>

        <div className="flex items-center gap-4 mb-6">
          <Avatar src={user.avatar} name={user.displayName} size="lg" />
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              loading={avatarMutation.isPending}
            >
              上传头像
            </Button>
            <p className="text-xs text-gray-400 mt-1">支持 jpg/png/webp，最大 2MB</p>
          </div>
        </div>

        <div className="space-y-4">
          <Input label="昵称" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">简介</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="介绍一下自己..."
            />
            <p className="text-xs text-gray-400">{bio.length}/500</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveProfile} loading={saveProfileMutation.isPending}>保存</Button>
            {profileMessage && (
              <span className={`text-sm ${profileMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {profileMessage.text}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Password section */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">修改密码</h2>
        <div className="space-y-4">
          <Input label="当前密码" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <Input label="新密码" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 8 位，含大小写和数字" />
          <Input label="确认新密码" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          <div className="flex items-center gap-3">
            <Button onClick={handleChangePassword} loading={changePasswordMutation.isPending}>修改密码</Button>
            {pwdMessage && (
              <span className={`text-sm ${pwdMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {pwdMessage.text}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Account info */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">账号信息</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>邮箱：<span className="text-gray-900">{user.email}</span></p>
          <p>用户名：<span className="text-gray-900">@{user.username}</span></p>
          <p>角色：<span className="text-gray-900">{getRoleNames(user).join(', ')}</span></p>
        </div>
      </section>
    </div>
  );
}
