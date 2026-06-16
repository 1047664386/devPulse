import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api-services';
import { Users, FileText, TrendingUp, Tag } from 'lucide-react';

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => adminApi.dashboard(),
  });

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-400 text-center py-12">加载中...</p>
      </div>
    );
  }

  const cards = [
    { icon: Users, label: '总用户', value: stats.totalUsers, sub: `今日 +${stats.todayNewUsers}` },
    { icon: FileText, label: '总文章', value: stats.totalArticles, sub: `今日 +${stats.todayNewArticles}` },
    { icon: TrendingUp, label: '7日活跃', value: stats.activeUsers7d, sub: '有登录或发文的用户' },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <card.icon className="w-4 h-4" />
              <span className="text-sm">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Top tags */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Tag className="w-4 h-4" /> 热门标签
        </h3>
        <div className="space-y-2">
          {stats.topTags.map((tag, i) => (
            <div key={tag.name} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                <span className="text-gray-400 mr-2">{i + 1}.</span>
                {tag.name}
              </span>
              <span className="text-gray-400">{tag.articleCount} 篇</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
