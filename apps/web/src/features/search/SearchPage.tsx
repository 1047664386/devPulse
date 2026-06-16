import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { searchApi } from '@/lib/api-services';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  const results = data?.data ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="relative mb-6">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索文章标题、内容、标签..."
          className="w-full pl-10 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          autoFocus
        />
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400 text-center py-12">搜索中...</p>
      )}

      {!isLoading && debouncedQuery.length >= 2 && results.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-12">
          没有找到相关结果
        </p>
      )}

      {debouncedQuery.length > 0 && debouncedQuery.length < 2 && !isLoading && (
        <p className="text-sm text-gray-400 text-center py-12">
          请输入至少 2 个字符进行搜索
        </p>
      )}

      {!isLoading && results.length > 0 && (
        <div className="space-y-4">
          {results.map((r) => (
            <Link
              key={r.id}
              to={`/article/${r.slug}`}
              className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition"
            >
              <h3
                className="text-base font-medium text-gray-900"
                dangerouslySetInnerHTML={{ __html: r.titleHighlight }}
              />
              {r.summary && <p className="mt-1 text-sm text-gray-500 line-clamp-2">{r.summary}</p>}
              <div className="mt-2 text-xs text-gray-400">
                {r.author.displayName}
                {r.publishedAt && ` · ${formatDate(r.publishedAt)}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
