import type { DebouncedFunc } from 'lodash';
import debounce from 'lodash/debounce';
import { AlertTriangle, ArrowLeft, Clock, Pause, Play, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WorkspacePanels } from '../../components/WorkspacePanels';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type {
  Exam,
  ExamResults,
  ProblemDetail,
  ProblemSubmissionHistoryItem,
  SubmissionQueued,
  SubmissionResponse,
} from '../../types/oj';

const POLLABLE_STATUSES = new Set(['Pending', 'Judging']);
const DRAFT_STORAGE_KEY_PREFIX = 'maks_oj_exam_draft_';

function buildDraftKey(examId: string, problemId: number) {
  return `${DRAFT_STORAGE_KEY_PREFIX}${examId}_p${problemId}`;
}

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  const [exam, setExam] = useState<Exam | null>(null);
  const [problems, setProblems] = useState<Record<number, ProblemDetail>>({});
  const [currentProblemId, setCurrentProblemId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fileContents, setFileContents] = useState<Record<number, Record<string, string>>>({});
  const [activeFiles, setActiveFiles] = useState<Record<number, string>>({});
  const [activeTabs, setActiveTabs] = useState<Record<number, 'description' | 'console' | 'history'>>({});
  const [submissions, setSubmissions] = useState<Record<number, SubmissionResponse | null>>({});
  const [histories, setHistories] = useState<Record<number, ProblemSubmissionHistoryItem[]>>({});
  const [restoredIds, setRestoredIds] = useState<Record<number, number | null>>({});
  const [isSubmitting, setIsSubmitting] = useState<Record<number, boolean>>({});
  const [editorVersions, setEditorVersions] = useState<Record<number, number>>({});
  const [draftSavedAts, setDraftSavedAts] = useState<Record<number, string | null>>({});
  const [pendingDraftSaves, setPendingDraftSaves] = useState<Record<number, boolean>>({});

  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);

  const pollRef = useRef<Record<number, number | null>>({});
  const draftSaveRefs = useRef<Record<number, DebouncedFunc<(files: Record<string, string>) => void>>>({});
  const latestFileContentsRef = useRef<Record<number, Record<string, string>>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const examRef = useRef<Exam | null>(null);

  useEffect(() => { examRef.current = exam; }, [exam]);
  useEffect(() => {
    latestFileContentsRef.current = fileContents;
  }, [fileContents]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/login', { state: { from: `/exam/${examId}` } });
      return;
    }
    void loadExam();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      Object.values(pollRef.current).forEach((id) => { if (id) clearInterval(id); });
      Object.values(draftSaveRefs.current).forEach((d) => d.cancel());
    };
  }, [examId]);

  useEffect(() => {
    if (!exam || exam.status === 'completed') return;
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [exam?.status, exam?.start_time, exam?.total_paused_seconds]);

  async function loadExam() {
    if (!examId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<Exam>(`/exams/${examId}`);
      if (data.user_id !== user?.id) {
        setError('无权访问此考试。');
        setLoading(false);
        return;
      }
      setExam(data);
      setIsPaused(data.status === 'paused');

      const problemMap: Record<number, ProblemDetail> = {};
      const fcMap: Record<number, Record<string, string>> = {};
      const afMap: Record<number, string> = {};
      const atMap: Record<number, 'description' | 'console' | 'history'> = {};
      for (const pid of data.problem_ids) {
        const { data: problem } = await api.get<ProblemDetail>(`/problems/${pid}`);
        problemMap[pid] = problem;

        const stored = readLocalDraft(examId, pid);
        if (stored && stored.templateHash === computeTemplateHashSimple(problem)) {
          fcMap[pid] = stored.files;
        } else {
          fcMap[pid] = { ...problem.template_files };
        }
        afMap[pid] = Object.keys(problem.template_files)[0] ?? 'main.cpp';
        atMap[pid] = 'description';
      }
      setProblems(problemMap);
      setFileContents(fcMap);
      setActiveFiles(afMap);
      setActiveTabs(atMap);
      if (data.problem_ids.length > 0) setCurrentProblemId(data.problem_ids[0]);

      if (data.status === 'completed') {
        navigate(`/exam/${examId}/results`, { replace: true });
      }
    } catch {
      setError('加载考试失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    const tick = () => {
      const ex = examRef.current;
      if (!ex || !ex.start_time || ex.status === 'completed') return;
      const nowSec = Date.now() / 1000;
      const startSec = new Date(ex.start_time).getTime() / 1000;
      const elapsed = nowSec - startSec - ex.total_paused_seconds;
      const total = ex.duration_minutes * 60;
      const remaining = Math.max(0, total - elapsed);
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        void autoSubmit();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  }

  async function autoSubmit() {
    if (submittingExam) return;
    setSubmittingExam(true);
    try {
      await api.post(`/exams/${examId}/submit`);
      navigate(`/exam/${examId}/results`, { replace: true });
    } catch {
      setSubmittingExam(false);
    }
  }

  async function handlePause() {
    if (!examId) return;
    await api.post(`/exams/${examId}/pause`);
    const { data } = await api.get<Exam>(`/exams/${examId}`);
    setExam(data);
    setIsPaused(true);
  }

  async function handleResume() {
    if (!examId) return;
    await api.post(`/exams/${examId}/resume`);
    const { data } = await api.get<Exam>(`/exams/${examId}`);
    setExam(data);
    setIsPaused(false);
  }

  async function handleSubmitExam() {
    if (!examId || submittingExam) return;
    setSubmittingExam(true);
    setShowConfirmSubmit(false);
    try {
      await api.post(`/exams/${examId}/submit`);
      navigate(`/exam/${examId}/results`, { replace: true });
    } catch {
      setSubmittingExam(false);
    }
  }

  function getCurrentProblem() {
    return currentProblemId ? problems[currentProblemId] : null;
  }

  function getCurrentFiles(): Record<string, string> {
    return currentProblemId ? fileContents[currentProblemId] ?? {} : {};
  }

  function handleCodeChange(value: string, fileName?: string) {
    const pid = currentProblemId;
    if (!pid) return;
    const targetFile = fileName || activeFiles[pid] || '';
    if (!targetFile) return;

    setFileContents((prev) => {
      const current = prev[pid] ?? {};
      return { ...prev, [pid]: { ...current, [targetFile]: value } };
    });

    const files = { ...(latestFileContentsRef.current[pid] ?? {}), [targetFile]: value };
    draftSaveRefs.current[pid]?.(files);
    setPendingDraftSaves((prev) => ({ ...prev, [pid]: true }));

    setRestoredIds((prev) => ({ ...prev, [pid]: null }));
  }

  function persistDraft(pid: number, files: Record<string, string>) {
    if (!examId) return;
    const problem = problems[pid];
    if (!problem) return;
    const readonlySet = new Set(problem.readonly_files ?? []);
    const editable: Record<string, string> = {};
    for (const [name, content] of Object.entries(files)) {
      if (!readonlySet.has(name)) editable[name] = content;
    }
    if (Object.keys(editable).length === 0) return;
    const hash = computeTemplateHashSimple(problem);
    const savedAt = writeLocalDraft(examId, pid, editable, hash);
    if (savedAt) {
      setDraftSavedAts((prev) => ({ ...prev, [pid]: savedAt }));
      setPendingDraftSaves((prev) => ({ ...prev, [pid]: false }));
    }
  }

  useEffect(() => {
    if (!examId || !problems[currentProblemId ?? 0]) return;
    const pid = currentProblemId ?? 0;
    const ref = draftSaveRefs.current;

    const debounced = debounce((files: Record<string, string>) => {
      persistDraft(pid, files);
    }, 60_000);
    ref[pid] = debounced;

    return () => {
      debounced.cancel();
      const latest = latestFileContentsRef.current[pid];
      if (latest && Object.keys(latest).length && problems[pid]) {
        persistDraft(pid, latest);
      }
      if (ref[pid] === debounced) delete ref[pid];
    };
  }, [currentProblemId, examId]);

  async function handleProblemSubmit() {
    const pid = currentProblemId;
    if (!pid || !user) return;
    const problem = problems[pid];
    if (!problem) return;

    setIsSubmitting((prev) => ({ ...prev, [pid]: true }));
    setSubmissions((prev) => ({ ...prev, [pid]: null }));
    setActiveTabs((prev) => ({ ...prev, [pid]: 'console' }));
    setRestoredIds((prev) => ({ ...prev, [pid]: null }));

    try {
      const { data } = await api.post<SubmissionQueued>('/submissions', {
        problem_id: pid,
        user_id: user.id,
        code: fileContents[pid] ?? {},
      });
      await pollSubmission(pid, data.submission_id);
    } catch {
      setIsSubmitting((prev) => ({ ...prev, [pid]: false }));
    }
  }

  async function pollSubmission(pid: number, submissionId: number) {
    if (pollRef.current[pid]) clearInterval(pollRef.current[pid]);

    const fetchStatus = async () => {
      const { data } = await api.get<SubmissionResponse>(`/submissions/${submissionId}`);
      setSubmissions((prev) => ({ ...prev, [pid]: data }));
      setHistories((prev) => ({
        ...prev,
        [pid]: mergeHistory(prev[pid] ?? [], data),
      }));
      if (!POLLABLE_STATUSES.has(data.status)) {
        if (pollRef.current[pid]) {
          clearInterval(pollRef.current[pid]);
          pollRef.current[pid] = null;
        }
        setIsSubmitting((prev) => ({ ...prev, [pid]: false }));
        setActiveTabs((prev) => ({ ...prev, [pid]: 'console' }));
      }
    };

    await fetchStatus();
    pollRef.current[pid] = window.setInterval(() => { void fetchStatus(); }, 2000);
  }

  function restoreSubmissionCode(pid: number, historyItem: ProblemSubmissionHistoryItem) {
    const problem = problems[pid];
    if (!problem) return;
    const readonlySet = new Set(problem.readonly_files ?? []);
    const merged = { ...problem.template_files };
    for (const [name, content] of Object.entries(historyItem.code)) {
      if (!readonlySet.has(name)) merged[name] = content;
    }
    setFileContents((prev) => ({ ...prev, [pid]: merged }));
    setActiveFiles((prev) => ({ ...prev, [pid]: Object.keys(problem.template_files)[0] ?? Object.keys(merged)[0] ?? 'main.cpp' }));
    setRestoredIds((prev) => ({ ...prev, [pid]: historyItem.id }));
    setEditorVersions((prev) => ({ ...prev, [pid]: (prev[pid] ?? 0) + 1 }));
  }

  function switchProblem(pid: number) {
    if (isPaused) return;
    setCurrentProblemId(pid);
  }

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const getProblemStatus = (pid: number): 'none' | 'ac' | 'attempted' => {
    const h = histories[pid] ?? [];
    if (h.length === 0) return 'none';
    return h.some((s) => s.status === 'AC') ? 'ac' : 'attempted';
  };

  const currentProblem = getCurrentProblem();
  const currentFiles = getCurrentFiles();
  const isCurrentSubmitting = currentProblemId ? isSubmitting[currentProblemId] ?? false : false;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">正在加载考试...</div>;
  }
  if (error || !exam) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-red-300">{error || '考试不存在。'}</div>;
  }

  return (
    <div className="relative flex h-screen flex-col bg-background">
      {/* Countdown header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card/30 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => navigate('/')} className="rounded-md p-1.5 transition-colors hover:bg-secondary/50">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">{exam.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-xl font-bold ${
            remainingSeconds < 300 ? 'bg-red-950/30 text-red-300' : 'bg-secondary/30 text-foreground'
          }`}>
            <Clock className="h-5 w-5" />
            {formatTime(remainingSeconds)}
          </div>
          {isPaused ? (
            <button type="button" onClick={handleResume} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:bg-emerald-500">
              <Play className="h-4 w-4" />继续考试
            </button>
          ) : (
            <button type="button" onClick={handlePause} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:bg-amber-500">
              <Pause className="h-4 w-4" />暂停考试
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowConfirmSubmit(true)}
            disabled={submittingExam}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />交卷
          </button>
        </div>
      </header>

      {/* Problem tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border/30 bg-secondary/10 px-6 py-2">
        {exam.problem_ids.map((pid, i) => {
          const status = getProblemStatus(pid);
          const isActive = pid === currentProblemId;
          return (
            <button
              key={pid}
              type="button"
              onClick={() => switchProblem(pid)}
              disabled={isPaused}
              className={`relative flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                isActive ? 'text-primary bg-background' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
              } disabled:opacity-50`}
            >
              <span className={`h-2 w-2 rounded-full ${
                status === 'ac' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' :
                status === 'attempted' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' :
                'bg-secondary'
              }`} />
              第{i + 1}题
            </button>
          );
        })}
      </div>

      {/* Main workspace area */}
      <div className="flex-1 overflow-hidden">
        {currentProblem ? (
          <WorkspacePanels
            problem={currentProblem}
            activeTab={currentProblemId ? activeTabs[currentProblemId] ?? 'description' : 'description'}
            onTabChange={(tab) => {
              if (currentProblemId) setActiveTabs((prev) => ({ ...prev, [currentProblemId]: tab }));
            }}
            fileOrder={Object.keys(currentFiles)}
            activeFile={currentProblemId ? activeFiles[currentProblemId] ?? '' : ''}
            onFileChange={(file) => {
              if (currentProblemId) setActiveFiles((prev) => ({ ...prev, [currentProblemId]: file }));
            }}
            fileContents={currentFiles}
            onCodeChange={handleCodeChange}
            editorVersion={currentProblemId ? editorVersions[currentProblemId] ?? 0 : 0}
            draftStatusLabel={currentProblemId ? (pendingDraftSaves[currentProblemId] ? '草稿待自动保存' : draftSavedAts[currentProblemId] ? `最后保存于 ${formatDraftTime(draftSavedAts[currentProblemId]!)}` : '自动保存已开启') : ''}
            isSubmitting={isCurrentSubmitting}
            submission={currentProblemId ? submissions[currentProblemId] ?? null : null}
            submissionHistory={currentProblemId ? histories[currentProblemId] ?? [] : []}
            restoredSubmissionId={currentProblemId ? restoredIds[currentProblemId] ?? null : null}
            onRestoreSubmission={(item) => {
              if (currentProblemId) restoreSubmissionCode(currentProblemId, item);
            }}
            onSubmit={() => { void handleProblemSubmit(); }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">没有题目数据。</div>
        )}
      </div>

      {/* Pause overlay */}
      {isPaused ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" style={{ top: 0, left: 0 }}>
          <div className="text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
            <h2 className="mb-2 text-2xl font-bold text-white">考试已暂停</h2>
            <p className="mb-8 text-muted-foreground">作答时间已暂停，题目内容不可见。点击下方按钮继续考试。</p>
            <button
              type="button"
              onClick={handleResume}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-base font-medium text-white shadow-lg transition hover:bg-emerald-500"
            >
              <Play className="h-5 w-5" />继续考试
            </button>
          </div>
        </div>
      ) : null}

      {/* Confirm submit dialog */}
      {showConfirmSubmit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" style={{ top: 0, left: 0 }}>
          <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-foreground">确认交卷？</h2>
            <p className="mb-6 text-sm text-muted-foreground">交卷后将无法继续作答，请确认所有题目已尽力完成。</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition hover:bg-secondary/50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleSubmitExam(); }}
                disabled={submittingExam}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition hover:opacity-90 disabled:opacity-50"
              >
                {submittingExam ? '交卷中...' : '确认交卷'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function mergeHistory(history: ProblemSubmissionHistoryItem[], submission: SubmissionResponse): ProblemSubmissionHistoryItem[] {
  const nextItem: ProblemSubmissionHistoryItem = {
    id: submission.id,
    problem_id: submission.problem_id,
    user_id: submission.user_id,
    code: submission.code,
    status: submission.status,
    created_at: submission.created_at,
    updated_at: submission.updated_at,
  };
  return [nextItem, ...history.filter((item) => item.id !== submission.id)];
}

interface LocalDraft {
  savedAt: string;
  files: Record<string, string>;
  templateHash: string;
}

function readLocalDraft(examId: string, problemId: number): LocalDraft | null {
  try {
    const raw = localStorage.getItem(buildDraftKey(examId, problemId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.savedAt === 'string' && isStringRecord(parsed?.files) && typeof parsed?.templateHash === 'string') {
      return parsed;
    }
    return null;
  } catch { return null; }
}

function writeLocalDraft(examId: string, problemId: number, files: Record<string, string>, templateHash: string): string | null {
  try {
    const savedAt = new Date().toISOString();
    localStorage.setItem(buildDraftKey(examId, problemId), JSON.stringify({ savedAt, files, templateHash }));
    return savedAt;
  } catch { return null; }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

function computeTemplateHashSimple(problem: ProblemDetail): string {
  const parts = [String(problem.id), problem.updated_at];
  const sorted = Object.keys(problem.template_files).sort();
  for (const name of sorted) parts.push(`tpl:${name}`);
  let hash = 0;
  for (const ch of parts.join('|')) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return `v1_${Math.abs(hash).toString(36)}`;
}

function formatDraftTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(d);
}
