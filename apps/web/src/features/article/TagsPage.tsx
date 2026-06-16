import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import TagBadge from '@/components/ui/TagBadge';
import { tagApi } from '@/lib/api-services';

export default function TagsPage() {
  const [search, setSearch] = useState('');

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: tagApi.list,
  });

  const filtered = tags.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">标签</h1>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索标签..."
        className="w-full px-4 py-2 text-sm border border-gray-300 rounded-md mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="h-6 w-20 bg-gray-200 rounded-full" />
                <div className="h-3 w-16 bg-gray-200 rounded" />
              </div>
              <div className="h-4 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tag) => (
            <Link
              key={tag.id}
              to={`/?tag=${tag.slug}`}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between mb-2">
                <TagBadge name={tag.name} color={tag.color} />
                <span className="text-xs text-gray-400">{tag.articleCount} 篇文章</span>
              </div>
              {tag.description && <p className="text-sm text-gray-500">{tag.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
