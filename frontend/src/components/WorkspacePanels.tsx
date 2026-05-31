import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  FileCode,
  History,
  Lock,
  Play,
  RotateCcw,
  Send,
  Terminal,
  XCircle,
} from 'lucide-react';
import { MobileTextareaEditor } from './MobileTextareaEditor';
import { OutputDiffPanel } from './OutputDiffPanel';
import { isMobileOrTablet } from './editorDevice';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { ProblemMarkdown } from './ProblemMarkdown';
import { toProblemMarkdown } from '../lib/problemContent';
import { api } from '../lib/api';
import type { CharDiffEntry, LineDiffEntry, OutputDiffResult } from '../lib/diff';
import type {
  ProblemDetail,
  ProblemSubmissionHistoryItem,
  RunExecutionResponse,
  SubmissionResponse,
  SubmissionStatus,
} from '../types/oj';

interface WorkspacePanelsProps {
  problem: ProblemDetail;
  activeTab: 'description' | 'console' | 'history';
  onTabChange: (tab: 'description' | 'console' | 'history') => void;
  fileOrder: string[];
  activeFile: string;
  onFileChange: (file: string) => void;
  fileContents: Record<string, string>;
  onCodeChange: (value: string, fileName?: string) => void;
  editorVersion: number;
  draftStatusLabel: string;
  isSubmitting: boolean;
  submission: SubmissionResponse | null;
  submissionHistory: ProblemSubmissionHistoryItem[];
  restoredSubmissionId: number | null;
  onRestoreSubmission: (submission: ProblemSubmissionHistoryItem) => void;
  onSubmit: () => void;
}

interface ParsedTestPoint {
  caseIndex: number;
  status: string;
  stdin: string;
  actualOutput: string;
  expectedOutput: string;
  stderr: string;
  timeMs: number | null;
  memoryKb: number | null;
  exitStatus: number | null;
  outputDiff: OutputDiffResult | null;
}

interface ScoreSummary {
  label: string;
  score: string;
}

interface ParsedConsoleDetails {
  phase: string | null;
  compileMessage: string | null;
  summaries: ScoreSummary[];
  testPoints: ParsedTestPoint[];
}

type EditorMode = 'auto' | 'simple' | 'advanced';

const EDITOR_MODE_KEY = 'oj-editor-mode';

const emptyOutputText = '暂无输出';

const sidebarTabs = [
  { id: 'description' as const, label: '题目说明', icon: null },
  { id: 'console' as const, label: '控制台', icon: Terminal },
  { id: 'history' as const, label: '提交记录', icon: History },
];

const testPointContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const testPointItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
};

const panelContentVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
};

export function WorkspacePanels({
  problem,
  activeTab,
  onTabChange,
  fileOrder,
  activeFile,
  onFileChange,
  fileContents,
  onCodeChange,
  editorVersion,
  draftStatusLabel,
  isSubmitting,
  submission,
  submissionHistory,
  restoredSubmissionId,
  onRestoreSubmission,
  onSubmit,
}: WorkspacePanelsProps) {
  const [playgroundInput, setPlaygroundInput] = useState('');
  const [playgroundOutput, setPlaygroundOutput] = useState('');
  const [playgroundError, setPlaygroundError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [editorMode, setEditorMode] = useState<EditorMode>('auto');
  const [isMobile, setIsMobile] = useState(false);
  const [pasteHint, setPasteHint] = useState('');
  const pasteHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsMobile(isMobileOrTablet());
    try {
      const saved = localStorage.getItem(EDITOR_MODE_KEY);
      if (saved === 'auto' || saved === 'simple' || saved === 'advanced') {
        setEditorMode(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pasteHintTimerRef.current) {
        clearTimeout(pasteHintTimerRef.current);
      }
    };
  }, []);

  const useSimpleEditor = editorMode === 'simple' || (editorMode === 'auto' && isMobile);

  function updateEditorMode(mode: EditorMode) {
    setEditorMode(mode);
    try {
      localStorage.setItem(EDITOR_MODE_KEY, mode);
    } catch {
      // ignore
    }
  }

  async function handlePasteFromClipboard() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        showPasteHint('无法直接读取剪贴板，请长按编辑框粘贴，或使用 Command + V。');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (typeof text === 'string' && text.length > 0) {
        onCodeChange(text, activeFile);
      }
    } catch {
      showPasteHint('无法直接读取剪贴板，请长按编辑框粘贴，或使用 Command + V。');
    }
  }

  function showPasteHint(msg: string) {
    setPasteHint(msg);
    if (pasteHintTimerRef.current) {
      clearTimeout(pasteHintTimerRef.current);
    }
    pasteHintTimerRef.current = setTimeout(() => setPasteHint(''), 4000);
  }

  const readonlyFiles = useMemo(() => new Set(problem.readonly_files ?? []), [problem.readonly_files]);
  const isReadonlyFile = readonlyFiles.has(activeFile);
  const consoleDetails = useMemo(() => parseConsoleDetails(problem, submission), [problem, submission]);
  const selectedPoint = consoleDetails.testPoints[selectedCaseIndex] ?? null;

  useEffect(() => {
    if (!consoleDetails.testPoints.length) {
      setSelectedCaseIndex(0);
      return;
    }
    if (selectedCaseIndex >= consoleDetails.testPoints.length) {
      setSelectedCaseIndex(0);
    }
  }, [consoleDetails.testPoints, selectedCaseIndex]);

  async function handleRun() {
    setIsRunning(true);
    setPlaygroundError('');
    setPlaygroundOutput('正在运行你的代码，请稍候...');
    try {
      const data = await requestRunResult(problem.id, fileContents, playgroundInput);
      setPlaygroundOutput(extractRunOutput(data));
    } catch (error) {
      console.error('Failed to run playground code', error);
      setPlaygroundOutput('');
      setPlaygroundError('测试运行失败，请确认后端 /api/run 可用后重试。');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div>
            <h1 className="text-lg font-medium text-foreground">{`题目 #${problem.id}: ${problem.title}`}</h1>
            <p className="text-xs text-muted-foreground">
              {problem.tags.length ? problem.tags.join(' / ') : '未分类题目'}
            </p>
          </div>
          <motion.button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className={`mr-2 inline h-4 w-4 ${isSubmitting ? 'animate-pulse' : ''}`} />
            {isSubmitting ? '正在提交评测...' : '提交评测'}
          </motion.button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal">
          <Panel defaultSize={34} minSize={24}>
            <div className="flex h-full flex-col bg-card/20">
              <div className="relative flex flex-wrap border-b border-border/30 bg-secondary/20">
                {sidebarTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onTabChange(tab.id)}
                      className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors duration-150 ${
                        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {Icon ? <Icon className="h-4 w-4" /> : null}
                      {tab.label}
                      {isActive ? (
                        <motion.div
                          className="absolute bottom-0 left-0 right-0 h-0.5"
                          style={{ backgroundColor: 'var(--primary)' }}
                          layoutId="sidebarTabIndicator"
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    variants={panelContentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="h-full"
                  >
                    {activeTab === 'description' ? (
                      <ProblemDescriptionPanel problem={problem} />
                    ) : activeTab === 'console' ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      >
                        <ConsolePanel
                          isSubmitting={isSubmitting}
                          submission={submission}
                          details={consoleDetails}
                          selectedPoint={selectedPoint}
                          selectedCaseIndex={selectedCaseIndex}
                          onSelectCase={setSelectedCaseIndex}
                          compact
                        />
                      </motion.div>
                    ) : (
                      <HistoryPanel
                        submissions={submissionHistory}
                        restoredSubmissionId={restoredSubmissionId}
                        onRestoreSubmission={onRestoreSubmission}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </Panel>

          <Separator className="w-1 cursor-col-resize bg-border/30 transition-colors hover:bg-primary/50" />

          <Panel defaultSize={66} minSize={40}>
            <div className="flex h-full flex-col">
              <div className="relative flex items-center gap-1 border-b border-border/30 bg-secondary/20 px-4 py-2">
                {fileOrder.map((file) => {
                  const isReadonly = readonlyFiles.has(file);
                  const isActive = activeFile === file;
                  return (
                    <button
                      key={file}
                      type="button"
                      onClick={() => onFileChange(file)}
                      className={`relative flex items-center gap-2 rounded-t-md px-4 py-2 font-mono text-sm transition-colors duration-150 ${
                        isActive
                          ? 'text-primary'
                          : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      }`}
                    >
                      <FileCode className="h-3.5 w-3.5" />
                      <span>{file}</span>
                      {isReadonly ? <Lock className="h-3.5 w-3.5 text-amber-300" /> : null}
                      {isActive ? (
                        <motion.div
                          className="absolute left-0 right-0 top-0 h-0.5 rounded-full"
                          style={{
                            backgroundColor: 'var(--primary)',
                            boxShadow: '0 0 10px var(--primary)',
                          }}
                          layoutId="fileTabIndicator"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-hidden bg-background">
                <Group orientation="vertical">
                  <Panel defaultSize={68} minSize={38}>
                    <div className="flex h-full flex-col">
                      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-background/80 px-4 py-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span>{isReadonlyFile ? '当前文件为只读模板，已锁定编辑。' : '当前文件可编辑。'}</span>
                          <select
                            value={editorMode}
                            onChange={(e) => updateEditorMode(e.target.value as EditorMode)}
                            className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                          >
                            <option value="auto">自动</option>
                            <option value="simple">简易编辑器</option>
                            <option value="advanced">高级编辑器</option>
                          </select>
                          {useSimpleEditor ? (
                            <button
                              type="button"
                              onClick={handlePasteFromClipboard}
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition hover:bg-accent hover:text-accent-foreground"
                            >
                              <ClipboardPaste className="h-3 w-3" />
                              粘贴代码
                            </button>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                          {restoredSubmissionId ? (
                            <span className="rounded-full border px-3 py-1 text-xs">
                              {`已恢复提交 #${restoredSubmissionId}`}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-border/50 bg-card/70 px-3 py-1 text-foreground">
                            {draftStatusLabel}
                          </span>
                          <span>{isReadonlyFile ? '只读模式' : '编辑模式'}</span>
                        </div>
                      </div>
                      {pasteHint ? (
                        <div className="shrink-0 border-b border-amber-500/30 bg-amber-950/20 px-4 py-2 text-xs text-amber-200">
                          {pasteHint}
                        </div>
                      ) : null}
                      {useSimpleEditor ? (
                        <div className="min-h-0 flex-1 overflow-auto p-2">
                          <MobileTextareaEditor
                            value={fileContents[activeFile] ?? ''}
                            onChange={(val) => onCodeChange(val, activeFile)}
                            language={resolveLanguage(activeFile)}
                            readOnly={isReadonlyFile}
                          />
                        </div>
                      ) : (
                        <Editor
                          key={`${activeFile}__${editorVersion}`}
                          height="100%"
                          theme="vs-dark"
                          path={activeFile}
                          language={resolveLanguage(activeFile)}
                          defaultValue={fileContents[activeFile] ?? ''}
                          onChange={(value) => onCodeChange(value ?? '', activeFile)}
                          options={{
                            automaticLayout: true,
                            minimap: { enabled: false },
                            fontSize: 14,
                            fontFamily: 'JetBrains Mono, monospace',
                            scrollBeyondLastLine: false,
                            roundedSelection: false,
                            padding: { top: 16 },
                            readOnly: isReadonlyFile,
                            fixedOverflowWidgets: true,
                            domReadOnly: isReadonlyFile,
                          }}
                        />
                      )}
                    </div>
                  </Panel>

                  <Separator className="h-1 cursor-row-resize bg-border/30 transition-colors hover:bg-primary/50" />

                  <Panel defaultSize={32} minSize={20}>
                    <PlaygroundPanel
                      inputValue={playgroundInput}
                      outputValue={playgroundOutput}
                      errorMessage={playgroundError}
                      isRunning={isRunning}
                      onInputChange={setPlaygroundInput}
                      onRun={handleRun}
                    />
                  </Panel>
                </Group>
              </div>
            </div>
          </Panel>
        </Group>
      </div>

      <div
        className="pointer-events-none fixed inset-0 opacity-5"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, color-mix(in srgb, var(--primary) 2%, transparent) 2px, color-mix(in srgb, var(--primary) 2%, transparent) 4px)',
        }}
      />
    </div>
  );
}

function ProblemDescriptionPanel({ problem }: { problem: ProblemDetail }) {
  const markdownContent = toProblemMarkdown(problem.description);

  return (
    <div className="problem-page" style={{ padding: '0', maxWidth: '100%' }}>
      {/* Tags & difficulty */}
      <div className="problem-badges">
        {problem.tags.map((tag) => (
          <span key={tag} className="problem-tag">{tag}</span>
        ))}
        <span className="problem-difficulty">{translateDifficulty(problem.difficulty)}</span>
      </div>

      {/* Meta info row */}
      <div className="problem-meta">
        <span className="problem-meta-item">
          <span className="problem-meta-label">时间限制</span>
          <span className="problem-meta-value--mono">{problem.time_limit_ms} ms</span>
        </span>
        <span className="problem-meta-separator" />
        <span className="problem-meta-item">
          <span className="problem-meta-label">内存限制</span>
          <span className="problem-meta-value--mono">{problem.memory_limit_kb} KB</span>
        </span>
      </div>

      {/* Markdown body */}
      <ProblemMarkdown content={markdownContent} />
    </div>
  );
}

function HistoryPanel({
  submissions,
  restoredSubmissionId,
  onRestoreSubmission,
}: {
  submissions: ProblemSubmissionHistoryItem[];
  restoredSubmissionId: number | null;
  onRestoreSubmission: (submission: ProblemSubmissionHistoryItem) => void;
}) {
  if (!submissions.length) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-border bg-background/30 px-6 text-center text-sm text-muted-foreground">
        你还没有这道题的历史提交。第一次提交之后，这里会自动生成时间线，并支持一键恢复代码。
      </div>
    );
  }

  return (
    <motion.div className="space-y-4" variants={testPointContainerVariants} initial="hidden" animate="visible">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm">
        最新提交会自动用于工作台断点续传。你也可以从下面任意一条记录恢复旧版本代码。
      </div>
      <div className="space-y-3">
        {submissions.map((historyItem, index) => {
          const isRestored = restoredSubmissionId === historyItem.id;
          return (
            <motion.div
              key={historyItem.id}
              variants={testPointItemVariants}
              className={`relative overflow-hidden rounded-2xl border p-4 ${
                isRestored
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/50 bg-background/60'
              }`}
            >
              {index !== submissions.length - 1 ? (
                <div className="absolute bottom-[-18px] left-[23px] top-[52px] w-px bg-muted" />
              ) : null}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-3 w-3 rounded-full ${getHistoryStatusDot(historyItem.status)}`} />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-foreground">{`提交 #${historyItem.id}`}</span>
                      <HistoryStatusBadge status={historyItem.status} />
                      {isRestored ? (
                        <span className="rounded-full border px-2 py-0.5 text-[11px]">
                          当前已恢复
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(historyItem.created_at)}</div>
                    <div className="text-xs text-muted-foreground">{`文件数 ${Object.keys(historyItem.code).length}`}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRestoreSubmission(historyItem)}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition hover:bg-accent hover:text-accent-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复代码
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function PlaygroundPanel({
  inputValue,
  outputValue,
  errorMessage,
  isRunning,
  onInputChange,
  onRun,
}: {
  inputValue: string;
  outputValue: string;
  errorMessage: string;
  isRunning: boolean;
  onInputChange: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="flex h-full flex-col border-t border-border/30 bg-background">
      <div className="flex items-center justify-between border-b border-border/30 bg-secondary/20 px-4 py-2">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          <span className="text-sm text-muted-foreground">在线自测区</span>
        </div>
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Sandbox</span>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <div className="min-w-0">
            <div className="flex h-full min-h-0 flex-col rounded-xl border border-border/50 bg-card/50">
              <div className="border-b border-border/50 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">标准输入区</h3>
                <p className="mt-1 text-xs text-muted-foreground">在此处填写输入数据，也可留空。</p>
              </div>
              <textarea
                value={inputValue}
                onChange={(event) => onInputChange(event.target.value)}
                className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder={'例如：\n5\n1 2 3 4 5'}
              />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex h-full min-h-0 flex-col rounded-xl border border-border/50 bg-card/50">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">实际输出区</h3>
                  <p className="mt-1 text-xs text-muted-foreground">使用题目限制执行当前代码，不会入库。</p>
                </div>
                <button
                  type="button"
                  onClick={onRun}
                  disabled={isRunning}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play className={`h-3.5 w-3.5 ${isRunning ? 'animate-pulse' : ''}`} />
                  {isRunning ? '运行中...' : '测试运行'}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                {errorMessage ? (
                  <div className="mb-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                    {errorMessage}
                  </div>
                ) : null}
                <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-foreground">
                  {outputValue || emptyOutputText}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsolePanel({
  isSubmitting,
  submission,
  details,
  selectedPoint,
  selectedCaseIndex,
  onSelectCase,
  compact = false,
}: {
  isSubmitting: boolean;
  submission: SubmissionResponse | null;
  details: ParsedConsoleDetails;
  selectedPoint: ParsedTestPoint | null;
  selectedCaseIndex: number;
  onSelectCase: (index: number) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-2xl border border-border/50 bg-background/80 shadow-[0_0_40px_rgba(15,23,42,0.4)]">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          评测控制台
        </div>
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Mak&apos;s Console</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        {isSubmitting ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
            <p className="text-sm text-primary">等待测试运行...</p>
          </div>
        ) : submission ? (
          <motion.div
            className="flex h-full flex-col gap-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="rounded-xl border p-4">
              <div
                className="mb-2 text-3xl font-bold"
                style={{ color: getStatusColor(submission.status), textShadow: `0 0 20px ${getStatusColor(submission.status)}` }}
              >
                {translateStatus(submission.status)}
              </div>
              <div className="mb-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                <span className="rounded-full border px-3 py-1 text-xs">
                  {`耗时 ${submission.runtime_ms ?? '-'} ms`}
                </span>
                <span className="rounded-full border px-3 py-1 text-xs">
                  {`内存 ${submission.memory_kb ?? '-'} KB`}
                </span>
                <span className="rounded-full border px-3 py-1 text-xs">
                  {`阶段 ${translatePhase(details.phase)}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {details.summaries.map((summary) => (
                  <span key={summary.label} className="rounded-full border border-border bg-card/80 px-3 py-1 text-xs tracking-[0.18em] text-foreground">
                    {`${summary.label} ${summary.score}`}
                  </span>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/50 bg-card/50">
              <div className={`grid h-full min-h-0 ${compact ? 'xl:grid-cols-[200px_minmax(0,1fr)]' : 'md:grid-cols-[220px_minmax(0,1fr)]'}`}>
                <div className={`p-3 ${compact ? 'border-b border-border/50 xl:border-b-0 xl:border-r' : 'border-b border-border/50 md:border-b-0 md:border-r'}`}>
                  <div className="mb-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">测试点导航</div>
                  <motion.div
                    className={`space-y-2 ${compact ? 'max-h-48 overflow-y-auto pr-1 xl:max-h-none xl:overflow-visible xl:pr-0' : ''}`}
                    variants={testPointContainerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {details.testPoints.length ? (
                      details.testPoints.map((point, index) => {
                        const tone = getPointTone(point.status);
                        return (
                          <motion.button
                            key={`${point.caseIndex}-${index}`}
                            variants={testPointItemVariants}
                            type="button"
                            onClick={() => onSelectCase(index)}
                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                              selectedCaseIndex === index
                                ? tone.selectedClass
                                : 'border-border/50 bg-background/50 text-foreground hover:border-border hover:bg-card/50'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {tone.icon}
                              <span>{`数据点 ${point.caseIndex}`}</span>
                            </span>
                            <span className="text-xs uppercase tracking-[0.18em]">{translatePointStatus(point.status)}</span>
                          </motion.button>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-4 text-sm text-muted-foreground">暂无可展开的测试点。</div>
                    )}
                  </motion.div>
                </div>

                <div className="min-h-0 overflow-auto p-4">
                  {details.compileMessage ? (
                    <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 p-4 shadow-[0_0_25px_rgba(248,113,113,0.08)]">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-300">
                        <AlertTriangle className="h-4 w-4" />
                        编译诊断
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-red-200">{details.compileMessage}</pre>
                    </div>
                  ) : null}

                  {selectedPoint ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        <span className="rounded-full border border-border bg-background px-3 py-1">{`数据点 ${selectedPoint.caseIndex}`}</span>
                        <span className="rounded-full border border-border bg-background px-3 py-1">{`状态 ${translatePointStatus(selectedPoint.status)}`}</span>
                        <span className="rounded-full border border-border bg-background px-3 py-1">{`耗时 ${formatMetric(selectedPoint.timeMs, 'ms')}`}</span>
                        <span className="rounded-full border border-border bg-background px-3 py-1">{`内存 ${formatMetric(selectedPoint.memoryKb, 'KB')}`}</span>
                        {selectedPoint.exitStatus !== null ? (
                          <span className="rounded-full border border-border bg-background px-3 py-1">{`退出码 ${selectedPoint.exitStatus}`}</span>
                        ) : null}
                      </div>
                      <AccordionBlock title="标准输入" content={selectedPoint.stdin || emptyOutputText} tone="cyan" />
                      <AccordionBlock title="实际输出" content={selectedPoint.actualOutput || emptyOutputText} tone="emerald" />
                      <AccordionBlock title="期望输出" content={selectedPoint.expectedOutput || emptyOutputText} tone="amber" />
                      {shouldShowSubmitOutputDiff(selectedPoint) ? <OutputDiffPanel diff={selectedPoint.outputDiff} /> : null}
                      {selectedPoint.stderr ? <AccordionBlock title="诊断输出" content={selectedPoint.stderr} tone="red" /> : null}
                    </div>
                  ) : !details.compileMessage ? (
                    <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-border bg-background/30 px-6 text-center text-sm text-muted-foreground">
                      当前提交暂无详细测试点数据，请等待评测完成后再查看。
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
        {!isSubmitting && !submission ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-border bg-background/30 px-6 text-center text-sm text-muted-foreground">
            提交代码后，这里会实时展示 Pending → Judging → 评测结果。
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AccordionBlock({
  title,
  content,
  tone,
}: {
  title: string;
  content: string;
  tone: 'cyan' | 'emerald' | 'amber' | 'red';
}) {
  const palette = getAccordionTone(tone);
  return (
    <details open className={`overflow-hidden rounded-xl border ${palette.container}`}>
      <summary className={`flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium ${palette.summary}`}>
        <span>{title}</span>
        <ChevronDown className="h-4 w-4" />
      </summary>
      <div className="border-t border-white/5 px-4 py-3">
        <pre className="whitespace-pre-wrap text-xs leading-6 text-foreground">{content}</pre>
      </div>
    </details>
  );
}

function resolveLanguage(fileName: string) {
  if (fileName.endsWith('.cpp') || fileName.endsWith('.cc') || fileName.endsWith('.cxx') || fileName.endsWith('.h') || fileName.endsWith('.hpp')) return 'cpp';
  if (fileName.endsWith('.py')) return 'python';
  if (fileName.endsWith('.java')) return 'java';
  if (fileName.endsWith('.js')) return 'javascript';
  if (fileName.endsWith('.ts')) return 'typescript';
  return 'plaintext';
}

function getStatusColor(status: SubmissionStatus) {
  switch (status) {
    case 'AC':
      return 'var(--status-ac)';
    case 'WA':
      return 'var(--status-wa)';
    case 'CE':
    case 'RE':
    case 'TLE':
    case 'MLE':
    case 'System Error':
      return 'var(--status-error)';
    default:
      return 'var(--status-pending)';
  }
}

function parseConsoleDetails(problem: ProblemDetail, submission: SubmissionResponse | null): ParsedConsoleDetails {
  if (!submission) {
    return { phase: null, compileMessage: null, summaries: [], testPoints: [] };
  }

  const parsed = isRecord(submission.judge_result) ? submission.judge_result : null;
  const compileNode = isRecord(parsed?.compile) ? parsed.compile : isRecord(parsed?.result) ? parsed.result : null;
  const compileMessage = normalizeText(submission.compiler_output) ?? extractCompileMessage(compileNode);
  const testPoints = extractTestPoints(parsed, problem);
  const passedCount = testPoints.filter((point) => isAcceptedStatus(point.status)).length;

  return {
    phase: typeof parsed?.phase === 'string' ? parsed.phase : null,
    compileMessage,
    summaries: [
      { label: '编译检查', score: submission.status === 'CE' ? '0/20' : '20/20' },
      { label: '标准测试', score: testPoints.length ? `${Math.round((passedCount / testPoints.length) * 20)}/20` : '--/20' },
    ],
    testPoints,
  };
}

function extractTestPoints(parsed: Record<string, unknown> | null, problem: ProblemDetail): ParsedTestPoint[] {
  if (!parsed || !Array.isArray(parsed.cases)) {
    return [];
  }

  return parsed.cases.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const result = isRecord(entry.result) ? entry.result : null;
    const files = isRecord(result?.files) ? result.files : null;
    const fallbackCase = problem.judge_cases[index];
    const rawCaseIndex = typeof entry.case_index === 'number' ? entry.case_index : index + 1;

    return [
      {
        caseIndex: rawCaseIndex,
        status: typeof entry.status === 'string' ? entry.status : typeof result?.status === 'string' ? result.status : 'Unknown',
        stdin: normalizeText(entry.input) ?? normalizeText(files?.stdin) ?? normalizeText(fallbackCase?.input) ?? '',
        actualOutput:
          normalizeText(entry.actual_output) ??
          normalizeText(entry.output) ??
          normalizeText(files?.stdout) ??
          '',
        expectedOutput:
          normalizeText(entry.expected_output) ??
          normalizeText(files?.answer) ??
          normalizeText(fallbackCase?.expected_output) ??
          '',
        stderr: normalizeText(files?.stderr) ?? '',
        timeMs: formatRuntime(result?.runTime),
        memoryKb: formatMemory(result?.memory),
        exitStatus: typeof result?.exitStatus === 'number' ? result.exitStatus : null,
        outputDiff: parseOutputDiff(entry.output_diff),
      },
    ];
  });
}

function extractCompileMessage(compileNode: Record<string, unknown> | null): string | null {
  if (!compileNode) {
    return null;
  }

  const files = isRecord(compileNode.files) ? compileNode.files : null;
  return normalizeText(files?.stderr) ?? normalizeText(files?.stdout) ?? null;
}

async function requestRunResult(problemId: number, code: Record<string, string>, stdin: string): Promise<unknown> {
  const payloads = [
    { problem_id: problemId, code, stdin },
    { problem_id: problemId, code, input: stdin },
    { problem_id: problemId, code, standard_input: stdin },
  ];

  let lastError: unknown = null;
  for (const payload of payloads) {
    try {
      const { data } = await api.post<RunExecutionResponse | string>('/run', payload);
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function extractRunOutput(payload: unknown): string {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (!isRecord(payload)) {
    return '程序已执行，但后端没有返回可展示的输出。';
  }

  const directOutput =
    normalizeText(payload.output) ??
    normalizeText(payload.stdout) ??
    normalizeText(payload.actual_output) ??
    normalizeText(payload.run_output);
  const files = isRecord(payload.files) ? payload.files : null;
  const result = isRecord(payload.result) ? payload.result : null;
  const resultFiles = isRecord(result?.files) ? result.files : null;
  const compile = isRecord(payload.compile) ? payload.compile : null;
  const compileFiles = isRecord(compile?.files) ? compile.files : null;
  const stdout = directOutput ?? normalizeText(files?.stdout) ?? normalizeText(resultFiles?.stdout);
  const stderr = normalizeText(payload.stderr) ?? normalizeText(files?.stderr) ?? normalizeText(resultFiles?.stderr);
  const detail =
    normalizeText(payload.detail) ??
    normalizeText(payload.message) ??
    normalizeText(compileFiles?.stderr) ??
    normalizeText(compileFiles?.stdout);
  const sections = [
    stdout ? `stdout\n${stdout}` : null,
    stderr && stderr !== stdout ? `stderr\n${stderr}` : null,
    detail && detail !== stdout && detail !== stderr ? `detail\n${detail}` : null,
  ].filter(Boolean);
  return sections.length ? sections.join('\n\n') : '程序已执行，但没有产生可展示的输出。';
}

function translateDifficulty(difficulty?: string | null) {
  switch (difficulty) {
    case 'Easy':
      return '简单';
    case 'Medium':
      return '中等';
    case 'Hard':
      return '困难';
    case undefined:
    case null:
    case '':
      return '未知难度';
    default:
      return difficulty;
  }
}

function translateStatus(status: SubmissionStatus) {
  switch (status) {
    case 'Pending':
      return '等待测试运行';
    case 'Judging':
      return '正在评测';
    case 'AC':
      return '答案正确';
    case 'WA':
      return '答案错误';
    case 'CE':
      return '编译错误';
    case 'RE':
      return '运行时错误';
    case 'TLE':
      return '超出时间限制';
    case 'MLE':
      return '超出内存限制';
    case 'System Error':
      return '系统错误';
    default:
      return status;
  }
}

function translatePointStatus(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'AC' || normalized === 'ACCEPTED') return '通过';
  if (normalized === 'WA') return '错误';
  if (normalized === 'PENDING') return '等待';
  if (normalized === 'JUDGING') return '评测中';
  return status;
}

function translatePhase(phase: string | null) {
  if (!phase) return '判题流程';
  if (phase === 'compile') return '编译阶段';
  if (phase === 'judge') return '静态测试';
  if (phase === 'fuzz') return '对拍测试';
  return phase;
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function shouldShowSubmitOutputDiff(point: ParsedTestPoint): point is ParsedTestPoint & { outputDiff: OutputDiffResult } {
  return point.status.toUpperCase() === 'WA' && !!point.actualOutput && !!point.expectedOutput && point.outputDiff?.has_diff === true;
}

function parseOutputDiff(value: unknown): OutputDiffResult | null {
  if (!isRecord(value) || typeof value.has_diff !== 'boolean' || !Array.isArray(value.line_diffs)) {
    return null;
  }

  return {
    has_diff: value.has_diff,
    first_diff_line: typeof value.first_diff_line === 'number' ? value.first_diff_line : null,
    normalized_equal: value.normalized_equal === true,
    line_diffs: value.line_diffs.flatMap(parseLineDiffEntry),
  };
}

function parseLineDiffEntry(value: unknown): LineDiffEntry[] {
  if (!isRecord(value) || typeof value.line_no !== 'number' || typeof value.is_different !== 'boolean') {
    return [];
  }

  return [
    {
      line_no: value.line_no,
      expected: typeof value.expected === 'string' ? value.expected : value.expected === null ? null : '',
      actual: typeof value.actual === 'string' ? value.actual : value.actual === null ? null : '',
      is_different: value.is_different,
      char_diff: Array.isArray(value.char_diff) ? value.char_diff.flatMap(parseCharDiffEntry) : undefined,
    },
  ];
}

function parseCharDiffEntry(value: unknown): CharDiffEntry[] {
  if (!isRecord(value)) {
    return [];
  }

  const type = value.type;
  if (type !== 'equal' && type !== 'insert' && type !== 'delete' && type !== 'replace') {
    return [];
  }

  return [
    {
      type,
      text: typeof value.text === 'string' ? value.text : undefined,
      expected: typeof value.expected === 'string' ? value.expected : undefined,
      actual: typeof value.actual === 'string' ? value.actual : undefined,
    },
  ];
}

function formatRuntime(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Number((value / 1_000_000).toFixed(2));
}

function formatMemory(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.round(value / 1024);
}

function formatMetric(value: number | null, unit: string) {
  return value === null ? `- ${unit}` : `${value} ${unit}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAcceptedStatus(status: string) {
  const normalized = status.toUpperCase();
  return normalized === 'AC' || normalized === 'ACCEPTED';
}

function getPointTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'AC' || normalized === 'ACCEPTED') {
    return {
      selectedClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-300" />,
    };
  }
  if (normalized === 'WA') {
    return {
      selectedClass: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
      icon: <AlertTriangle className="h-4 w-4 text-amber-300" />,
    };
  }
  return {
    selectedClass: 'border-red-500/40 bg-red-500/10 text-red-200',
    icon: <XCircle className="h-4 w-4 text-red-300" />,
  };
}

function getAccordionTone(tone: 'cyan' | 'emerald' | 'amber' | 'red') {
  switch (tone) {
    case 'emerald':
      return { container: 'border-emerald-500/25 bg-emerald-950/15', summary: 'bg-emerald-500/10 text-emerald-200' };
    case 'amber':
      return { container: 'border-amber-500/25 bg-amber-950/15', summary: 'bg-amber-500/10 text-amber-200' };
    case 'red':
      return { container: 'border-red-500/25 bg-red-950/15', summary: 'bg-red-500/10 text-red-200' };
    default:
      return { container: 'border-primary/25 bg-primary/5', summary: 'bg-primary/10' };
  }
}

function getHistoryStatusDot(status: SubmissionStatus) {
  switch (status) {
    case 'AC':
      return 'bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.5)]';
    case 'Pending':
    case 'Judging':
      return 'bg-primary';
    case 'WA':
      return 'bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.5)]';
    default:
      return 'bg-red-400 shadow-[0_0_16px_rgba(248,113,113,0.5)]';
  }
}

function HistoryStatusBadge({ status }: { status: SubmissionStatus }) {
  const palette = getHistoryStatusPalette(status);
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${palette}`}>{translateStatus(status)}</span>;
}

function getHistoryStatusPalette(status: SubmissionStatus) {
  switch (status) {
    case 'AC':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
    case 'Pending':
    case 'Judging':
      return 'border-primary/30 bg-primary/10';
    case 'WA':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    default:
      return 'border-red-500/30 bg-red-500/10 text-red-200';
  }
}
