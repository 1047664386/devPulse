import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useQuery, useMutation } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { articleApi } from '@/lib/api-services';
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Code, Undo, Redo } from 'lucide-react';
import type { ArticleDetail } from '@/types/api';

export default function ArticleEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const { user } = useAuthStore();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: existingArticle, isLoading: loadingArticle } = useQuery<ArticleDetail>({
    queryKey: ['article', editId],
    queryFn: () => articleApi.getById(editId!),
    enabled: !!editId,
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
    }
  }, [existingArticle, editor]);

  const createMutation = useMutation({
    mutationFn: articleApi.create,
    onSuccess: (data) => {
      navigate(`/article/${data.slug}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : '保存失败，请重试';
      setErrorMsg(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; content?: string; summary?: string; version: number } }) =>
      articleApi.update(id, data),
    onSuccess: (data) => {
      navigate(`/article/${data.slug}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : '保存失败，请重试';
      setErrorMsg(message);
    },
  });

  if (!user) {
    navigate('/login');
    return null;
  }

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

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async (status: 'DRAFT' | 'PUBLISHED') => {
    if (!editor) return;
    setErrorMsg(null);

    const content = editor.getHTML();
    if (!title.trim()) {
      setErrorMsg('请输入文章标题');
      return;
    }

    if (editId && existingArticle) {
      updateMutation.mutate({
        id: editId,
        data: {
          title: title.trim(),
          content,
          summary: summary.trim() || undefined,
          version: existingArticle.version,
        },
      });
    } else {
      createMutation.mutate({
        title: title.trim(),
        content,
        summary: summary.trim() || undefined,
        status,
        tagIds: [],
      });
    }
  };

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
            <Button variant="secondary" size="sm" onClick={() => handleSave('DRAFT')} loading={isSaving}>
              存草稿
            </Button>
            <Button size="sm" onClick={() => handleSave('PUBLISHED')} loading={isSaving}>
              {editId ? '更新' : '发布'}
            </Button>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
