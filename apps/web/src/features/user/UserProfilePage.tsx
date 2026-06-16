import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { userApi } from '@/lib/api-services';
import Avatar from '@/components/ui/Avatar';
import ArticleCard from '@/components/ArticleCard';
import Button from '@/components/ui/Button';
import { Calendar, FileText, Heart, Users } from 'lucide-react';

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [isFollowing, setIsFollowing] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['user-profile', id],
    queryFn: () => userApi.getProfile(id!),
    enabled: !!id,
  });

  const { data: articlesData, isLoading: articlesLoading } = useQuery({
    queryKey: ['user-articles', id],
    queryFn: () => userApi.getArticles(id!),
    enabled: !!id,
  });

  const followMutation = useMutation({
    mutationFn: () => userApi.toggleFollow(id!),
    onSuccess: (data) => {
      setIsFollowing(data.followed);
      queryClient.invalidateQueries({ queryKey: ['user-profile', id] });
    },
  });

  if (profileLoading || !profile) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const userArticles = articlesData?.data ?? [];
  const isSelf = currentUser?.id === profile.id;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Profile header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-4">
          <Avatar src={profile.avatar} name={profile.displayName} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{profile.displayName}</h1>
                <p className="text-sm text-gray-500">@{profile.username}</p>
              </div>
              {isSelf ? (
                <Link to="/settings">
                  <Button variant="secondary" size="sm">编辑资料</Button>
                </Link>
              ) : (
                <Button
                  size="sm"
                  variant={isFollowing ? 'secondary' : undefined}
                  onClick={() => followMutation.mutate()}
                  loading={followMutation.isPending}
                >
                  {isFollowing ? '已关注' : '关注'}
                </Button>
              )}
            </div>
            {profile.bio && <p className="mt-2 text-sm text-gray-600">{profile.bio}</p>}
            <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(profile.createdAt).toLocaleDateString('zh-CN')} 加入
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-4 gap-4 pt-4 border-t border-gray-100">
          {[
            { icon: FileText, label: '文章', value: profile.stats.articleCount },
            { icon: Heart, label: '获赞', value: profile.stats.totalLikes },
            { icon: Users, label: '粉丝', value: profile.stats.followerCount },
            { icon: Users, label: '关注', value: profile.stats.followingCount },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* User articles */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">文章</h2>
      {articlesLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : userArticles.length > 0 ? (
        <div className="space-y-4">
          {userArticles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-8">暂无文章</p>
      )}
    </div>
  );
}
