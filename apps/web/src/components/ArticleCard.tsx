import { Link } from 'react-router-dom';
import type { ArticleListItem } from '@/types/api';
import { formatDate, formatNumber, truncate } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';
import TagBadge from '@/components/ui/TagBadge';
import { Eye, Heart, MessageSquare } from 'lucide-react';

interface ArticleCardProps {
  article: ArticleListItem;
}

export default function ArticleCard({ article }: ArticleCardProps) {
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
          <Link to={`/article/${article.slug}`}>
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
            src={article.coverImage}
            alt=""
            className="hidden sm:block w-28 h-20 rounded-md object-cover flex-shrink-0"
          />
        )}
      </div>
    </article>
  );
}
