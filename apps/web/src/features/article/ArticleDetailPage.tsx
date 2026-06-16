import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatNumber } from '@/lib/utils';
import { articleApi, commentApi } from '@/lib/api-services';
import Avatar from '@/components/ui/Avatar';
import TagBadge from '@/components/ui/TagBadge';
import Button from '@/components/ui/Button';
import { Heart, BookMarked, Share2, Eye, Clock } from 'lucide-react';
import { useState } from 'react';
import type { ArticleDetail, Comment } from '@/types/api';

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');

  const {
    data: article,
    isLoading: articleLoading,
    error: articleError,
  } = useQuery<ArticleDetail>({
    queryKey: ['article', slug],
    queryFn: () => articleApi.getBySlug(slug!),
    enabled: !!slug,
  });

  const {
    data: comments = [],
    isLoading: commentsLoading,
  } = useQuery<Comment[]>({
    queryKey: ['comments', article?.id],
    queryFn: () => commentApi.list(article!.id),
    enabled: !!article?.id,
  });

  const likeMutation = useMutation({
    mutationFn: () => articleApi.toggleLike(article!.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['article', slug] });
      const previous = queryClient.getQueryData<ArticleDetail>(['article', slug]);
      if (previous) {
        queryClient.setQueryData<ArticleDetail>(['article', slug], {
          ...previous,
          isLiked: !previous.isLiked,
          likeCount: previous.isLiked ? previous.likeCount - 1 : previous.likeCount + 1,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['article', slug], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['article', slug] });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: () => articleApi.toggleBookmark(article!.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['article', slug] });
      const previous = queryClient.getQueryData<ArticleDetail>(['article', slug]);
      if (previous) {
        queryClient.setQueryData<ArticleDetail>(['article', slug], {
          ...previous,
          isBookmarked: !previous.isBookmarked,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['article', slug], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['article', slug] });
    },
  });

  const postCommentMutation = useMutation({
    mutationFn: (content: string) => commentApi.create(article!.id, { content }),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['comments', article?.id] });
    },
  });

  const handleToggleLike = () => {
    if (!article) return;
    likeMutation.mutate();
  };

  const handleToggleBookmark = () => {
    if (!article) return;
    bookmarkMutation.mutate();
  };

  const handleSubmitComment = () => {
    if (!commentText.trim()) return;
    postCommentMutation.mutate(commentText.trim());
  };

  if (articleLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-9 w-3/4 bg-gray-200 rounded" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-200 rounded-full" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
          <div className="h-4 w-48 bg-gray-200 rounded" />
          <div className="space-y-2 mt-8">
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-2/3 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (articleError || !article) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-500">文章不存在或加载失败</p>
        <Link to="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          返回首页
        </Link>
      </div>
    );
  }

  const isAuthor = user?.id === article.author.id;
  const liked = article.isLiked;
  const bookmarked = article.isBookmarked;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 leading-tight">{article.title}</h1>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/users/${article.author.id}`}>
              <Avatar src={article.author.avatar} name={article.author.displayName} size="md" />
            </Link>
            <div>
              <Link
                to={`/users/${article.author.id}`}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 transition"
              >
                {article.author.displayName}
              </Link>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{formatDate(article.publishedAt || article.createdAt)}</span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {article.readTimeMinutes} 分钟
                </span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Eye className="w-3 h-3" />
                  {formatNumber(article.viewCount)}
                </span>
              </div>
            </div>
          </div>

          {isAuthor && (
            <Link to={`/editor?id=${article.id}`}>
              <Button variant="secondary" size="sm">编辑</Button>
            </Link>
          )}
        </div>

        {/* Tags */}
        <div className="mt-3 flex items-center gap-2">
          {article.tags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
      </header>

      {/* Article content */}
      <div
        className="prose prose-gray max-w-none prose-headings:font-semibold prose-a:text-blue-600 prose-img:rounded-lg"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />

      {/* Action bar */}
      <div className="mt-10 pt-6 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleToggleLike}
            disabled={!isAuthenticated || likeMutation.isPending}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition ${
              liked
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
            {formatNumber(article.likeCount)}
          </button>

          <button
            onClick={handleToggleBookmark}
            disabled={!isAuthenticated || bookmarkMutation.isPending}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition ${
              bookmarked
                ? 'bg-blue-50 text-blue-600 border border-blue-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            <BookMarked className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
            {bookmarked ? '已收藏' : '收藏'}
          </button>
        </div>

        <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition">
          <Share2 className="w-4 h-4" />
          分享
        </button>
      </div>

      {/* Comments section */}
      <section className="mt-8 pt-6 border-t border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          评论 ({article.commentCount})
        </h2>
        {isAuthenticated ? (
          <div className="mb-6">
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="写下你的评论..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                onClick={handleSubmitComment}
                loading={postCommentMutation.isPending}
                disabled={!commentText.trim()}
              >
                发表评论
              </Button>
            </div>
            {postCommentMutation.isError && (
              <p className="text-sm text-red-500 mt-1">评论发布失败，请重试</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-6">
            <Link to="/login" className="text-blue-600 hover:underline">登录</Link> 后发表评论
          </p>
        )}

        {/* Comments list */}
        {commentsLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
                  <div className="h-4 w-full bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">暂无评论，来发表第一条评论吧</p>
        ) : (
          <div className="space-y-5">
            {comments.map((comment: Comment) => (
              <div key={comment.id} className="flex gap-3">
                <Link to={`/users/${comment.author.id}`} className="flex-shrink-0">
                  <Avatar src={comment.author.avatar} name={comment.author.displayName} size="sm" />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      to={`/users/${comment.author.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 transition"
                    >
                      {comment.author.displayName}
                    </Link>
                    <span className="text-xs text-gray-400">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Heart className={`w-3 h-3 ${comment.isLiked ? 'fill-current text-red-500' : ''}`} />
                      {comment.likeCount}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
