import { ArrowLeft, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { Exam } from '../../types/oj';

export default function ExamCreatePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [title, setTitle] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  if (!isAuthenticated) {
    navigate('/login', { state: { from: '/exam/create' } });
    return null;
  }

  function addSlug() {
    const trimmed = slugInput.trim();
    if (!trimmed) return;
    if (slugs.includes(trimmed)) {
      setError('该 slug 已添加。');
      return;
    }
    setSlugs((prev) => [...prev, trimmed]);
    setSlugInput('');
    setError('');
  }

  function removeSlug(index: number) {
    setSlugs((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSlugKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSlug();
    }
  }

  async function handleCreate() {
    if (!title.trim()) {
      setError('请输入考试标题。');
      return;
    }
    if (slugs.length === 0) {
      setError('请至少添加一道题目。');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const { data: problemList } = await api.get<{ items: { id: number; slug: string }[] }>('/problems', {
        params: { page: 1, page_size: 500 },
      });
      const slugToId = new Map(problemList.items.map((p) => [p.slug, p.id]));

      const problemIds: number[] = [];
      const missing: string[] = [];
      for (const slug of slugs) {
        const id = slugToId.get(slug);
        if (id) {
          problemIds.push(id);
        } else {
          missing.push(slug);
        }
      }

      if (missing.length > 0) {
        setError(`以下题目 slug 未找到: ${missing.join(', ')}`);
        setCreating(false);
        return;
      }

      const { data: exam } = await api.post<Exam>('/exams', {
        title: title.trim(),
        problem_ids: problemIds,
        duration_minutes: durationMinutes,
      });
      navigate(`/exam/${exam.id}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? '创建考试失败。'
          : '创建考试失败。';
      setError(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="absolute left-6 top-6 rounded-md p-2 transition-colors hover:bg-secondary/50"
      >
        <ArrowLeft className="h-5 w-5 text-muted-foreground" />
      </button>

      <div className="w-full max-w-lg rounded-2xl border border-border/50 bg-card/60 p-8 shadow-[0_0_60px_rgba(15,23,42,0.4)] backdrop-blur-sm">
        <h1 className="mb-8 text-2xl font-bold text-foreground">创建模拟考试</h1>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">考试标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：模拟一：W1-W6 诊断"
              className="w-full rounded-lg border border-border bg-background/80 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">题目 Slug（逗号分隔或逐个添加）</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                onKeyDown={handleSlugKeyDown}
                placeholder="输入 slug 后按回车添加"
                className="flex-1 rounded-lg border border-border bg-background/80 px-4 py-3 text-sm font-mono text-foreground outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={addSlug}
                className="rounded-lg border border-border bg-secondary/50 px-4 py-3 transition hover:bg-secondary"
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {slugs.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {slugs.map((slug, i) => (
                  <span
                    key={slug}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/30 px-3 py-1 font-mono text-xs text-foreground"
                  >
                    <span className="text-muted-foreground">{i + 1}.</span> {slug}
                    <button type="button" onClick={() => removeSlug(i)} className="ml-0.5 text-muted-foreground hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">考试时长（分钟）</label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(1, Math.min(1440, parseInt(e.target.value) || 120)))}
              min={1}
              max={1440}
              className="w-full rounded-lg border border-border bg-background/80 px-4 py-3 font-mono text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">{error}</div>
          ) : null}

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="w-full rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? '正在创建...' : '创建考试'}
          </button>
        </div>
      </div>
    </div>
  );
}
