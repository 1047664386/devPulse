import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { ArticleListItem, ArticleDetail } from '@/types/api';
import { formatDate, formatNumber, truncate, resolveUploadUrl } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';
import TagBadge from '@/components/ui/TagBadge';
import { Eye, Heart, MessageSquare } from 'lucide-react';

interface ArticleCardProps {
  article: ArticleListItem;
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const queryClient = useQueryClient();

  /**
   * 点击文章时立即乐观更新查看次数（不等后端响应）
   *
   * 1. 列表缓存中该文章 viewCount +1 → 用户返回首页时立即看到新数字
   * 2. 详情页缓存预设 viewCount +1 → 详情页打开即显示 +1，API 返回后校准
   *
   * 业内实践（掘金/知乎）：查看次数属于"低精度高频计数器"，
   * 前端乐观 +1 + 后端返回真实值校准，用户感知上就是即时的。
   */
  const handleViewOptimistic = () => {
    const newCount = article.viewCount + 1;

    // 乐观更新所有列表缓存
    const patchList = (old: { data: Array<ArticleListItem & { id: string }> } | undefined) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: old.data.map((a) =>
          a.id === article.id ? { ...a, viewCount: newCount } : a,
        ),
      };
    };

    queryClient.setQueriesData({ queryKey: ['articles'], exact: false }, patchList);
    queryClient.setQueriesData({ queryKey: ['user-articles'], exact: false }, patchList);

    // 预设详情页缓存（API 返回后会被真实值覆盖）
    queryClient.setQueryData<ArticleDetail>(['article', article.slug], (old) => {
      if (!old) return old;
      return { ...old, viewCount: newCount };
    });
  };

  return (
    <article className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow">
      <div className="flex gap-4">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Author info */}
          <div className="flex items-center gap-2 mb-2">
            <Link to={`/users/${article.author.id}`}>
              <Avatar src={article.author.avatar} name={article.author.displayName} size="sm" />
            </Link>
            <Link
              to={`/users/${article.author.id}`}
              className="text-sm text-gray-600 hover:text-blue-600 transition"
            >
              {article.author.displayName}
            </Link>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">
              {formatDate(article.publishedAt || article.createdAt)}
            </span>
          </div>

          {/* Title */}
          <Link to={`/article/${article.slug}`} onClick={handleViewOptimistic}>
            <h2 className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition line-clamp-2">
              {article.title}
            </h2>
          </Link>

          {/* Summary */}
          {article.summary && (
            <p className="mt-1.5 text-sm text-gray-500 line-clamp-2">
              {truncate(article.summary, 150)}
            </p>
          )}

          {/* Footer: tags + stats */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              {article.tags.map((tag) => (
                <TagBadge key={tag.id} name={tag.name} color={tag.color} />
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                {formatNumber(article.viewCount)}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="w-3.5 h-3.5" />
                {formatNumber(article.likeCount)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                {formatNumber(article.commentCount)}
              </span>
            </div>
          </div>
        </div>

        {/* Cover image */}
        {article.coverImage && (
          <img
            src={resolveUploadUrl(article.coverImage)}
            alt=""
            className="hidden sm:block w-28 h-20 rounded-md object-cover flex-shrink-0"
          />
        )}
      </div>
    </article>
  );
}
