import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articleApi } from '@/lib/api-services';
import { FileEdit, Trash2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 15;

export default function MyDraftsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['my-drafts', page],
    queryFn: () => articleApi.getDrafts({ page, pageSize: PAGE_SIZE }),
  });

  const deleteMutation = useMutation({
    mutationFn: articleApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-drafts'] });
    },
  });

  const drafts = data?.data ?? [];
  const meta = data?.meta;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">我的草稿</h1>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-white rounded-lg border border-gray-200 p-4">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-16">
          <FileEdit className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400 mb-4">还没有草稿</p>
          <Link
            to="/editor"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition"
          >
            开始写作
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">
                      {draft.title || '无标题草稿'}
                    </h3>
                    {draft.summary && (
                      <p className="mt-1 text-sm text-gray-500 truncate">{draft.summary}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(draft.createdAt)}
                      </span>
                      {draft.tags.length > 0 && (
                        <span>
                          {draft.tags.map((t) => t.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => navigate(`/editor/${draft.id}`)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                      title="继续编辑"
                    >
                      <FileEdit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('确定删除这篇草稿？')) {
                          deleteMutation.mutate(draft.id);
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-500">
                {page} / {meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
