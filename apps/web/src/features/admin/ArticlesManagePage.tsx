import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import { adminApi } from '@/lib/api-services';

export default function ArticlesManagePage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-articles'],
    queryFn: () => adminApi.listArticles(),
  });

  const articles = data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteArticle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
      // 前台文章列表和用户文章列表也需要同步
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.invalidateQueries({ queryKey: ['user-articles'] });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('确定删除这篇文章？')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div>
        <p className="text-sm text-gray-400 text-center py-12">加载中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-500">标题</th>
              <th className="text-left px-4 py-2 font-medium text-gray-500">作者</th>
              <th className="text-left px-4 py-2 font-medium text-gray-500">状态</th>
              <th className="text-left px-4 py-2 font-medium text-gray-500">阅读</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {articles.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link to={`/article/${a.slug}`} className="font-medium text-gray-900 hover:text-blue-600">
                    {a.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{a.author.displayName}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      a.status === 'PUBLISHED'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{a.viewCount}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="danger" size="sm" onClick={() => handleDelete(a.id)}>
                    删除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
