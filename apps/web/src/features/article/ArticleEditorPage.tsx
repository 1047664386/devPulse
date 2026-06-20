import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { articleApi, tagApi } from '@/lib/api-services';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Undo,
  Redo,
  Tag,
  Check,
} from 'lucide-react';
import type { ArticleDetail, Tag as TagType } from '@/types/api';

export default function ArticleEditorPage() {
  const navigate = useNavigate();
  const { id: paramId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  // 兼容两种 URL 格式：/editor/:id（路由参数）和 /editor?id=xxx（查询参数）
  const editId = paramId || searchParams.get('id');
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [tagSearch, setTagSearch] = useState('');

  // ─── Load existing article ───────────────────────────
  const { data: existingArticle, isLoading: loadingArticle } = useQuery<ArticleDetail>({
    queryKey: ['article', editId],
    queryFn: () => articleApi.getById(editId!),
    enabled: !!editId,
  });

  // ─── Load all tags for selector ──────────────────────
  const { data: allTags } = useQuery<TagType[]>({
    queryKey: ['tags'],
    queryFn: tagApi.list,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '开始写作...' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-gray max-w-none min-h-[400px] focus:outline-none px-4 py-3',
      },
    },
  });

  useEffect(() => {
    if (existingArticle && editor) {
      setTitle(existingArticle.title);
      setSummary(existingArticle.summary || '');
      editor.commands.setContent(existingArticle.content);
      setSelectedTagIds(existingArticle.tags.map((t) => t.id));
    }
  }, [existingArticle, editor, editId]);

  // ─── Publish mutation (with validation) ──────────────
  const createMutation = useMutation({
    mutationFn: articleApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.invalidateQueries({ queryKey: ['user-articles'] });
      queryClient.invalidateQueries({ queryKey: ['my-drafts'] });
      navigate(`/article/${data.slug}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : '发布失败，请重试';
      setErrorMsg(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; content?: string; summary?: string; status?: string; tagIds?: string[]; version: number } }) =>
      articleApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['article', data.slug] });
      queryClient.invalidateQueries({ queryKey: ['article', editId] });
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      queryClient.invalidateQueries({ queryKey: ['user-articles'] });
      queryClient.invalidateQueries({ queryKey: ['my-drafts'] });
      navigate(`/article/${data.slug}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : '更新失败，请重试';
      setErrorMsg(message);
    },
  });

  // ─── Draft mutations (no validation, no navigate) ────
  const createDraftMutation = useMutation({
    mutationFn: articleApi.saveDraft,
    onSuccess: (data) => {
      setDraftStatus('saved');
      // 将 URL 从 /editor 切换到 /editor/:id，但不刷新页面
      navigate(`/editor/${data.id}`, { replace: true });
      // 重置 QueryClient 中此文章的缓存，让 useQuery 用新 ID 重新获取
      queryClient.invalidateQueries({ queryKey: ['article', data.id] });
      setTimeout(() => setDraftStatus('idle'), 3000);
    },
    onError: () => {
      setDraftStatus('error');
      setTimeout(() => setDraftStatus('idle'), 3000);
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof articleApi.updateDraft>[1] }) =>
      articleApi.updateDraft(id, data),
    onSuccess: () => {
      setDraftStatus('saved');
      // 静默更新缓存，不刷新页面
      queryClient.invalidateQueries({ queryKey: ['article', editId] });
      queryClient.invalidateQueries({ queryKey: ['my-drafts'] });
      setTimeout(() => setDraftStatus('idle'), 3000);
    },
    onError: () => {
      setDraftStatus('error');
      setTimeout(() => setDraftStatus('idle'), 3000);
    },
  });

  // ─── Create tag on-the-fly ──────────────────────────
  const createTagMutation = useMutation({
    mutationFn: tagApi.create,
    onSuccess: (newTag) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      // Auto-select the newly created tag
      setSelectedTagIds((prev) => [...prev, newTag.id]);
      setTagSearch('');
    },
  });

  if (!user) {
    navigate('/login');
    return null;
  }

  // ─── Handle Publish (with validation) ────────────────
  const handlePublish = () => {
    if (!editor) return;
    setErrorMsg(null);

    const content = editor.getHTML();
    if (!title.trim()) {
      setErrorMsg('请输入文章标题');
      return;
    }
    if (title.trim().length < 5) {
      setErrorMsg('标题至少 5 个字符');
      return;
    }
    if (!content.trim() || content === '<p></p>') {
      setErrorMsg('请输入文章内容');
      return;
    }

    if (editId && existingArticle) {
      updateMutation.mutate({
        id: editId,
        data: {
          title: title.trim(),
          content,
          summary: summary.trim() || undefined,
          status: 'PUBLISHED',
          tagIds: selectedTagIds,
          version: existingArticle.version,
        },
      });
    } else {
      createMutation.mutate({
        title: title.trim(),
        content,
        summary: summary.trim() || undefined,
        status: 'PUBLISHED',
        tagIds: selectedTagIds,
      });
    }
  };

  // ─── Handle Draft Save (no validation, no navigate) ──
  const handleSaveDraft = useCallback(() => {
    if (!editor) return;
    setErrorMsg(null);
    setDraftStatus('saving');

    const content = editor.getHTML();
    const draftData = {
      title,
      content,
      summary: summary.trim() || undefined,
      tagIds: selectedTagIds,
    };

    if (editId) {
      updateDraftMutation.mutate({ id: editId, data: draftData });
    } else {
      createDraftMutation.mutate(draftData);
    }
  }, [editor, title, summary, selectedTagIds, editId]);

  // ─── Ctrl/Cmd + S 快捷键保存草稿 ────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveDraft();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveDraft]);

  const isPublishing = createMutation.isPending || updateMutation.isPending;
  const isSavingDraft = createDraftMutation.isPending || updateDraftMutation.isPending;

  // ─── Tag toggle helper ──────────────────────────────
  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  // ─── Filtered tags for search ───────────────────────
  const filteredTags = allTags?.filter((tag) => {
    if (!tagSearch.trim()) return true;
    return tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase());
  }) ?? [];

  const exactMatch = allTags?.some(
    (t) => t.name.toLowerCase() === tagSearch.trim().toLowerCase(),
  );

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagSearch.trim()) {
      e.preventDefault();
      if (exactMatch) {
        // Select the existing tag instead of creating a duplicate
        const match = allTags!.find(
          (t) => t.name.toLowerCase() === tagSearch.trim().toLowerCase(),
        );
        if (match && !selectedTagIds.includes(match.id)) {
          setSelectedTagIds((prev) => [...prev, match.id]);
        }
        setTagSearch('');
      } else {
        createTagMutation.mutate({ name: tagSearch.trim() });
      }
    }
  };

  // ─── Toolbar Button ─────────────────────────────────
  const ToolbarButton = ({
    onClick,
    active,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`p-1.5 rounded transition ${
        active ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );

  if (editId && loadingArticle) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-9 w-3/4 bg-gray-200 rounded" />
          <div className="h-4 w-1/2 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Error message */}
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
          {errorMsg}
        </div>
      )}

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="文章标题"
        className="w-full text-3xl font-bold text-gray-900 border-none outline-none placeholder:text-gray-300 mb-4"
      />

      {/* Summary */}
      <input
        type="text"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="文章摘要（可选，用于列表展示）"
        className="w-full text-sm text-gray-500 border-none outline-none placeholder:text-gray-300 mb-4"
      />

      {/* Tag selector */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Tag className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">选择或创建标签</span>
        </div>

        {/* Selected tags */}
        {selectedTagIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {allTags
              ?.filter((t) => selectedTagIds.includes(t.id))
              .map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                >
                  <Check className="w-3 h-3" />
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className="ml-0.5 text-blue-400 hover:text-blue-600"
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
        )}

        {/* Search / create input */}
        <div className="relative">
          <input
            type="text"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            onKeyDown={handleTagInputKeyDown}
            placeholder="输入标签名搜索，按 Enter 创建新标签"
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:border-blue-300 focus:outline-none"
          />
          {createTagMutation.isPending && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              创建中...
            </span>
          )}
          {createTagMutation.isError && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-400">
              创建失败
            </span>
          )}
        </div>

        {/* Filtered tag suggestions */}
        {tagSearch.trim() && filteredTags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {filteredTags.slice(0, 10).map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    toggleTag(tag.id);
                    setTagSearch('');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition ${
                    selected
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {selected && <Check className="w-3 h-3" />}
                  {tag.name}
                </button>
              );
            })}
            {!exactMatch && tagSearch.trim().length > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 text-xs text-gray-400">
                按 Enter 创建「{tagSearch.trim()}」
              </span>
            )}
          </div>
        )}

        {/* Show all tags when input is empty */}
        {!tagSearch.trim() && allTags && allTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition ${
                    selected
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {selected && <Check className="w-3 h-3" />}
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Toolbar */}
      {editor && (
        <div className="flex items-center gap-0.5 p-2 bg-white border border-gray-200 rounded-t-lg flex-wrap">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
            <Heading3 className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')}>
            <Code className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()}>
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()}>
            <Redo className="w-4 h-4" />
          </ToolbarButton>

          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {/* Draft save status indicator */}
            <span className="text-xs text-gray-400 mr-1">
              {draftStatus === 'saving' && '保存中...'}
              {draftStatus === 'saved' && '✓ 已保存'}
              {draftStatus === 'error' && '保存失败'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSaveDraft}
              loading={isSavingDraft}
            >
              存草稿
            </Button>
            <Button size="sm" onClick={handlePublish} loading={isPublishing}>
              {editId ? '更新发布' : '发布'}
            </Button>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg">
        <EditorContent editor={editor} />
      </div>

      {/* Hint */}
      <p className="mt-2 text-xs text-gray-400 text-right">
        按 Ctrl+S / Cmd+S 快速保存草稿
      </p>
    </div>
  );
}
