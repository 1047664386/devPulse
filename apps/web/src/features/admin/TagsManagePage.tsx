import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import TagBadge from '@/components/ui/TagBadge';
import { adminApi } from '@/lib/api-services';

export default function TagsManagePage() {
  const queryClient = useQueryClient();

  const { data: tags, isLoading } = useQuery({
    queryKey: ['admin-tags'],
    queryFn: () => adminApi.listTags(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tags'] });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('确定删除这个标签？')) {
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
              <th className="text-left px-4 py-2 font-medium text-gray-500">标签</th>
              <th className="text-left px-4 py-2 font-medium text-gray-500">Slug</th>
              <th className="text-left px-4 py-2 font-medium text-gray-500">文章数</th>
              <th className="text-right px-4 py-2 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(tags ?? []).map((tag) => (
              <tr key={tag.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <TagBadge name={tag.name} color={tag.color} />
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{tag.slug}</td>
                <td className="px-4 py-3 text-gray-500">{tag.articleCount}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="danger" size="sm" onClick={() => handleDelete(tag.id)}>
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
