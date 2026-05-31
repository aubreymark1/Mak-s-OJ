import Editor from '@monaco-editor/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Code2, FileJson, FileText, FlaskConical, LoaderCircle, Save, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { api } from '../../lib/api';
import type { AdminProblemDetail, AdminProblemPayload, JudgeCase } from '../../types/oj';

type RightTab = 'template' | 'generator' | 'std' | 'cases';

const rightTabs: { id: RightTab; label: string; icon: typeof Code2 }[] = [
  { id: 'template', label: '模板代码', icon: Code2 },
  { id: 'generator', label: '对拍生成器', icon: Zap },
  { id: 'std', label: '标准答案', icon: FlaskConical },
  { id: 'cases', label: '静态用例', icon: FileJson },
];

const defaultProblem: AdminProblemPayload = {
  slug: '',
  title: '',
  statement_markdown: '# 题目标题\n\n在此编写题目描述...',
  difficulty: 'Easy',
  tags: [],
  template_files: { 'main.cpp': '#include <iostream>\nint main() {\n    // Your code here\n    return 0;\n}\n' },
  readonly_files: [],
  time_limit_ms: 2000,
  memory_limit_kb: 262144,
  judge_cases: [],
  generator_code: '',
  std_code: '',
};

export default function AdminProblemEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const [form, setForm] = useState<AdminProblemPayload>({ ...defaultProblem });
  const [activeTab, setActiveTab] = useState<RightTab>('template');
  const [activeFile, setActiveFile] = useState('main.cpp');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const loadProblem = useCallback(async (problemId: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<AdminProblemDetail>(`/admin/problems/${problemId}`);
      setForm({
        slug: data.slug,
        title: data.title,
        statement_markdown: data.statement_markdown,
        difficulty: data.difficulty ?? 'Easy',
        tags: data.tags,
        template_files: data.template_files,
        readonly_files: data.readonly_files,
        time_limit_ms: data.time_limit_ms,
        memory_limit_kb: data.memory_limit_kb,
        judge_cases: data.judge_cases,
        generator_code: data.generator_code ?? '',
        std_code: data.std_code ?? '',
      });
      setActiveFile(Object.keys(data.template_files)[0] ?? 'main.cpp');
    } catch {
      setError('题目加载失败。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isNew && id) {
      void loadProblem(parseInt(id, 10));
    }
  }, [id, isNew, loadProblem]);

  function updateField<K extends keyof AdminProblemPayload>(key: K, value: AdminProblemPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateTemplateFile(fileName: string, content: string) {
    setForm((prev) => ({ ...prev, template_files: { ...prev.template_files, [fileName]: content } }));
  }

  function addTemplateFile() {
    const name = prompt('输入新文件名 (如 utils.h):');
    if (name && !form.template_files[name]) {
      updateTemplateFile(name, '');
      setActiveFile(name);
    }
  }

  function removeTemplateFile(name: string) {
    if (Object.keys(form.template_files).length <= 1) return;
    const rest = { ...form.template_files };
    delete rest[name];
    setForm((prev) => ({ ...prev, template_files: rest, readonly_files: prev.readonly_files.filter((f) => f !== name) }));
    setActiveFile(Object.keys(rest)[0]);
  }

  function toggleReadonly(name: string) {
    setForm((prev) => ({
      ...prev,
      readonly_files: prev.readonly_files.includes(name)
        ? prev.readonly_files.filter((f) => f !== name)
        : [...prev.readonly_files, name],
    }));
  }

  const currentEditorValue = useMemo(() => {
    switch (activeTab) {
      case 'template':
        return form.template_files[activeFile] ?? '';
      case 'generator':
        return form.generator_code ?? '';
      case 'std':
        return form.std_code ?? '';
      case 'cases':
        return JSON.stringify(form.judge_cases, null, 2);
      default:
        return '';
    }
  }, [activeTab, activeFile, form]);

  const currentLanguage = useMemo(() => {
    if (activeTab === 'cases') return 'json';
    if (activeFile.endsWith('.h') || activeFile.endsWith('.hpp')) return 'cpp';
    return 'cpp';
  }, [activeTab, activeFile]);

  function handleEditorChange(value: string | undefined) {
    const v = value ?? '';
    switch (activeTab) {
      case 'template':
        updateTemplateFile(activeFile, v);
        break;
      case 'generator':
        updateField('generator_code', v);
        break;
      case 'std':
        updateField('std_code', v);
        break;
      case 'cases':
        try {
          const parsed = JSON.parse(v) as JudgeCase[];
          if (Array.isArray(parsed)) updateField('judge_cases', parsed);
        } catch { /* ignore invalid JSON while typing */ }
        break;
    }
  }

  function buildPayload(): AdminProblemPayload {
    return {
      ...form,
      title: form.title.trim(),
      slug: form.slug.trim(),
      statement_markdown: form.statement_markdown.trim(),
      generator_code: form.generator_code?.trim() || null,
      std_code: form.std_code?.trim() || null,
      judge_cases: Array.isArray(form.judge_cases) ? form.judge_cases : [],
      tags: Array.isArray(form.tags) ? form.tags.filter(Boolean) : [],
      readonly_files: Array.isArray(form.readonly_files)
        ? form.readonly_files.filter((f) => f in form.template_files)
        : [],
    };
  }

  function formatError(err: unknown): string {
    const axiosErr = err as { response?: { status?: number; data?: { detail?: unknown } } };
    const status = axiosErr?.response?.status;
    const detail = axiosErr?.response?.data?.detail;

    if (typeof detail === 'string') {
      return `保存失败 (${status}): ${detail}`;
    }
    if (Array.isArray(detail)) {
      const msgs = detail.map((d: unknown) => {
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          const obj = d as { loc?: string[]; msg?: string };
          const loc = obj.loc?.join(' > ') ?? '';
          const msg = obj.msg ?? '';
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(d);
      });
      return `保存失败 (${status}): ${msgs.join('; ')}`;
    }
    return `保存失败 (${status ?? '网络错误'})，请检查表单。`;
  }

  async function handleSave() {
    setError('');
    if (!form.title.trim()) { setError('题目标题不能为空。'); return; }
    if (!form.slug.trim()) { setError('Slug 不能为空。'); return; }
    if (!form.statement_markdown.trim()) { setError('题面描述不能为空。'); return; }
    if (!form.template_files || Object.keys(form.template_files).length === 0) {
      setError('至少需要一个模板文件。'); return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (isNew) {
        await api.post('/admin/problems', payload);
      } else {
        await api.put(`/admin/problems/${id}`, payload);
      }
      setToast(isNew ? '题目创建成功！' : '题目更新成功！');
      setTimeout(() => { setToast(''); navigate('/admin'); }, 1200);
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">正在加载题目数据...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-56px)] flex-col">
        {/* Top toolbar */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-lg font-medium">{isNew ? '新建题目' : `编辑题目 #${id}`}</h1>
              <p className="text-xs text-muted-foreground">填写完整的题目信息、模板代码与评测数据</p>
            </div>
          </div>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? '保存中...' : '保存发布'}
          </Button>
        </div>

        {error ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
        ) : null}

        {/* Main split panels */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Basic info */}
          <div className="w-[420px] min-w-[320px] overflow-y-auto border-r p-4">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">题目标题</label>
                <Input value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="如：两数之和" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Slug</label>
                <Input value={form.slug} onChange={(e) => updateField('slug', e.target.value)} placeholder="如：a-b-sum" className="font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">时间限制 (ms)</label>
                  <Input type="number" value={String(form.time_limit_ms)} onChange={(e) => updateField('time_limit_ms', parseInt(e.target.value) || 2000)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">内存限制 (KB)</label>
                  <Input type="number" value={String(form.memory_limit_kb)} onChange={(e) => updateField('memory_limit_kb', parseInt(e.target.value) || 262144)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">难度</label>
                <div className="flex gap-2">
                  {['Easy', 'Medium', 'Hard'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateField('difficulty', d)}
                      className={`rounded-md border px-4 py-1.5 text-xs font-medium transition ${
                        form.difficulty === d
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">标签（逗号分隔）</label>
                <Input value={form.tags.join(', ')} onChange={(e) => updateField('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} placeholder="数学, 模拟, C++" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">题面描述 (Markdown)</label>
                <Textarea value={form.statement_markdown} onChange={(e) => updateField('statement_markdown', e.target.value)} rows={10} className="font-mono text-xs leading-6" />
              </div>
            </div>
          </div>

          {/* Right: Code & data matrix */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Right tab bar */}
            <div className="relative flex items-center gap-1 border-b bg-muted/20 px-4 py-2">
              {rightTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors duration-150 ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                    {isActive ? (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                        layoutId="adminEditorTabIndicator"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* File sub-bar (for template tab) */}
            {activeTab === 'template' ? (
              <div className="flex items-center gap-1 border-b bg-muted/10 px-4 py-1.5">
                {Object.keys(form.template_files).map((file) => (
                  <button
                    key={file}
                    type="button"
                    onClick={() => setActiveFile(file)}
                    className={`relative flex items-center gap-1.5 rounded-t-md px-3 py-1.5 font-mono text-xs transition-colors ${activeFile === file ? 'text-primary bg-background' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <FileText className="h-3 w-3" />
                    {file}
                    {form.readonly_files.includes(file) ? <Badge variant="outline" className="text-[9px]">只读</Badge> : null}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleReadonly(file); }}
                      className="ml-1 text-[9px] text-muted-foreground hover:text-primary"
                      title="切换只读"
                    >
                      🔒
                    </button>
                    {Object.keys(form.template_files).length > 1 ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeTemplateFile(file); }}
                        className="ml-1 text-[9px] text-muted-foreground hover:text-destructive"
                        title="删除文件"
                      >
                        ✕
                      </button>
                    ) : null}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addTemplateFile}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted/30 hover:text-foreground"
                >
                  + 添加文件
                </button>
              </div>
            ) : null}

            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeTab}-${activeFile}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="h-full"
                >
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    language={currentLanguage}
                    value={currentEditorValue}
                    onChange={handleEditorChange}
                    options={{
                      automaticLayout: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      fontFamily: 'JetBrains Mono, monospace',
                      scrollBeyondLastLine: false,
                      padding: { top: 12 },
                      fixedOverflowWidgets: true,
                      domReadOnly: false,
                      readOnly: false,
                    }}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 z-[200] -translate-x-1/2 rounded-full border bg-card px-6 py-3 text-sm font-medium text-foreground shadow-lg"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}
