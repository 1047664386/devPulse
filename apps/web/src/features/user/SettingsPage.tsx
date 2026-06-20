import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getRoleNames } from '@/types/api';
import { profileApi, authApi } from '@/lib/api-services';
import { useNavigate } from 'react-router-dom';
import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import { Monitor, Smartphone, Globe, Trash2 } from 'lucide-react';

/** 根据 platform 选择图标 */
function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'iOS':
    case 'Android':
      return <Smartphone className="w-4 h-4 text-gray-400" />;
    case 'macOS':
    case 'Windows':
    case 'Linux':
      return <Monitor className="w-4 h-4 text-gray-400" />;
    default:
      return <Globe className="w-4 h-4 text-gray-400" />;
  }
}

/** 格式化时间为相对时间 */
function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function SettingsPage() {
  const { user, updateUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  // 修改密码后，后端会自动全部下线，前端需要重新登录
  const changePasswordMutation = useMutation({
    mutationFn: () => profileApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setPwdMessage({ type: 'success', text: '密码已修改，请重新登录' });
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 1500);
    },
    onError: (err: Error) => {
      setPwdMessage({ type: 'error', text: err.message || '密码修改失败' });
    },
  });

  // ─── Device Sessions ─────────────────────────────
  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: authApi.getSessions,
    enabled: !!user,
  });

  const revokeDeviceMutation = useMutation({
    mutationFn: (deviceId: string) => authApi.logoutDevice(deviceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSuccess: () => {
      logout();
      navigate('/login');
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
        <p className="text-sm text-gray-500 mb-4">修改密码后所有设备将自动下线，需要重新登录。</p>
        <div className="space-y-4">
          <PasswordInput label="当前密码" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <PasswordInput label="新密码" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 8 位，含大小写和数字" />
          <PasswordInput label="确认新密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
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

      {/* Device Sessions section */}
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">登录设备</h2>
          {sessions.length > 1 && (
            <button
              onClick={() => {
                if (confirm('确认退出所有设备？你需要在当前设备重新登录。')) {
                  logoutAllMutation.mutate();
                }
              }}
              disabled={logoutAllMutation.isPending}
              className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
            >
              退出所有设备
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">暂无活跃设备</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.deviceId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={session.platform} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{session.deviceName}</p>
                    <p className="text-xs text-gray-500">
                      {session.ip} &middot; 登录于 {timeAgo(session.loginAt)} &middot; 最近活跃 {timeAgo(session.lastActiveAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => revokeDeviceMutation.mutate(session.deviceId)}
                  disabled={revokeDeviceMutation.isPending}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition disabled:opacity-50"
                  title="下线此设备"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
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
