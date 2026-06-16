import { useQuery } from '@tanstack/react-query';
import { profileApi } from '@/lib/api-services';
import ArticleCard from '@/components/ArticleCard';
import { BookMarked } from 'lucide-react';

export default function BookmarksPage() {
  const { data: bookmarksData, isLoading } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => profileApi.getBookmarks(),
  });

  const bookmarks = bookmarksData?.data ?? [];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <BookMarked className="w-5 h-5 text-gray-700" />
        <h1 className="text-xl font-bold text-gray-900">我的收藏</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="text-center py-16">
          <BookMarked className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">还没有收藏任何文章</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookmarks.map((item) => (
            <ArticleCard key={item.id} article={item.article} />
          ))}
        </div>
      )}
    </div>
  );
}
