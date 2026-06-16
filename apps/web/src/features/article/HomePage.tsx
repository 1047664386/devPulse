import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ArticleCard from '@/components/ArticleCard';
import TagBadge from '@/components/ui/TagBadge';
import { articleApi, tagApi } from '@/lib/api-services';
import type { ArticleListParams } from '@/types/api';

type SortOption = 'latest' | 'hot' | 'most-liked';

const SORT_MAP: Record<SortOption, ArticleListParams['sortBy']> = {
  latest: 'publishedAt',
  hot: 'viewCount',
  'most-liked': 'likeCount',
};

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTag = searchParams.get('tag');
  const [sort, setSort] = useState<SortOption>('latest');
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag);
  const [page, setPage] = useState(1);

  const sortOptions: Array<{ key: SortOption; label: string }> = [
    { key: 'latest', label: '最新' },
    { key: 'hot', label: '最热' },
    { key: 'most-liked', label: '最多赞' },
  ];

  const { data: tagsData, isLoading: tagsLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: tagApi.list,
  });

  const { data: articlesResponse, isLoading: articlesLoading } = useQuery({
    queryKey: ['articles', page, sort, selectedTag],
    queryFn: () =>
      articleApi.list({
        page,
        pageSize: 10,
        sortBy: SORT_MAP[sort],
        sortOrder: 'desc',
        ...(selectedTag ? { tag: selectedTag } : {}),
      }),
  });

  const articles = articlesResponse?.data ?? [];
  const meta = articlesResponse?.meta;
  const tags = tagsData ?? [];

  const handleTagSelect = (tagSlug: string | null) => {
    setSelectedTag(tagSlug);
    setPage(1);
    if (tagSlug) {
      setSearchParams({ tag: tagSlug });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Sort tabs */}
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setSort(opt.key); setPage(1); }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                sort === opt.key
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Article list */}
        {articlesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-gray-200 rounded-full" />
                      <div className="h-3 w-24 bg-gray-200 rounded" />
                    </div>
                    <div className="h-5 w-3/4 bg-gray-200 rounded mb-2" />
                    <div className="h-4 w-full bg-gray-100 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            暂无文章
          </div>
        ) : (
          articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
            >
              上一页
            </button>
            <span className="text-sm text-gray-500">
              {meta.page} / {meta.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0 space-y-4">
        {/* Tags */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">热门标签</h3>
          {tagsLoading ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <TagBadge
                name="全部"
                onClick={() => handleTagSelect(null)}
                className={selectedTag === null ? 'ring-2 ring-blue-400' : ''}
              />
              {tags.map((tag) => (
                <TagBadge
                  key={tag.id}
                  name={tag.name}
                  color={tag.color}
                  onClick={() => handleTagSelect(tag.slug)}
                  className={selectedTag === tag.slug ? 'ring-2 ring-blue-400' : ''}
                />
              ))}
            </div>
          )}
        </div>

        {/* About */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">关于 DevPulse</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            一个全栈学习项目，前端 React + 后端 NestJS + PostgreSQL。
            重点练习后端架构、数据库设计和并发控制。
          </p>
        </div>
      </aside>
    </div>
  );
}
