import type { DebouncedFunc } from 'lodash';
import debounce from 'lodash/debounce';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { WorkspacePanels } from '../components/WorkspacePanels';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type {
  ProblemDetail,
  ProblemSubmissionHistoryItem,
  SubmissionQueued,
  SubmissionResponse,
} from '../types/oj';

const POLLABLE_STATUSES = new Set(['Pending', 'Judging']);
const DRAFT_STORAGE_KEY_PREFIX = 'maks_oj_draft_';
const AUTO_SAVE_DELAY_MS = 60_000;

interface LocalProblemDraft {
  savedAt: string;
  files: Record<string, string>;
  templateHash: string;
}

export default function ProblemWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'description' | 'console' | 'history'>('description');
  const [activeFile, setActiveFile] = useState('');
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<ProblemSubmissionHistoryItem[]>([]);
  const [restoredSubmissionId, setRestoredSubmissionId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [hasPendingDraftSave, setHasPendingDraftSave] = useState(false);
  const pollRef = useRef<number | null>(null);
  const latestProblemIdRef = useRef<string | null>(null);
  const latestFileContentsRef = useRef<Record<string, string>>({});
  const draftSaveRef = useRef<DebouncedFunc<(problemId: string, files: Record<string, string>) => void> | null>(null);

  const persistDraft = useEffectEvent((problemId: string, files: Record<string, string>, problem: ProblemDetail) => {
    const readonlySet = new Set(problem.readonly_files ?? []);
    const editableFiles: Record<string, string> = {};
    for (const [name, content] of Object.entries(files)) {
      if (!readonlySet.has(name)) {
        editableFiles[name] = content;
      }
    }
    if (Object.keys(editableFiles).length === 0) {
      return;
    }
    const templateHash = computeTemplateHash(problem);
    const savedAt = writeLocalProblemDraft(problemId, editableFiles, templateHash);
    if (!savedAt) {
      return;
    }
    setDraftSavedAt(savedAt);
    setHasPendingDraftSave(false);
  });

  const fileOrder = useMemo(() => Object.keys(fileContents), [fileContents]);
  const draftStatusLabel = useMemo(() => {
    if (hasPendingDraftSave) {
      return '\u8349\u7a3f\u5f85\u81ea\u52a8\u4fdd\u5b58';
    }
    if (draftSavedAt) {
      return `\u6700\u540e\u4fdd\u5b58\u4e8e ${formatDraftTimestamp(draftSavedAt)}`;
    }
    return '\u81ea\u52a8\u4fdd\u5b58\u5df2\u5f00\u542f';
  }, [draftSavedAt, hasPendingDraftSave]);

  const loadWorkspace = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');

    const problemRequest = api.get<ProblemDetail>(`/problems/${id}`);
    const historyRequest = isAuthenticated && user
      ? api.get<ProblemSubmissionHistoryItem[]>(`/problems/${id}/my_submissions`)
      : Promise.resolve({ data: [] as ProblemSubmissionHistoryItem[] });

    try {
      const [problemResult, historyResult] = await Promise.allSettled([problemRequest, historyRequest]);
      if (problemResult.status !== 'fulfilled') {
        throw problemResult.reason;
      }

      const problemData = problemResult.value.data;
      const historyData = historyResult.status === 'fulfilled' ? historyResult.value.data : [];
      const latestSubmission = historyData[0] ?? null;
      const readonlySet = new Set(problemData.readonly_files ?? []);
      const currentTemplateHash = computeTemplateHash(problemData);

      const recoveredFiles: Record<string, string> = { ...(problemData.template_files || {}) };
      let draftToSave: string | null = null;

      if (latestSubmission) {
        for (const [name, content] of Object.entries(latestSubmission.code)) {
          if (!readonlySet.has(name)) {
            recoveredFiles[name] = content;
          }
        }
      } else {
        const localDraft = readLocalProblemDraft(id);
        if (localDraft) {
          if (localDraft.templateHash === currentTemplateHash) {
            for (const [name, content] of Object.entries(localDraft.files)) {
              if (!readonlySet.has(name) && name in (problemData.template_files || {})) {
                recoveredFiles[name] = content;
              }
            }
            draftToSave = localDraft.savedAt;
          } else {
            clearLocalProblemDraft(id);
          }
        }
      }

      if (problemData.type === 'choice' && !recoveredFiles['answers.json']) {
        recoveredFiles['answers.json'] = JSON.stringify({ answers: {} });
      }

      setProblem(problemData);
      setSubmissionHistory(historyData);
      setFileContents(recoveredFiles);
      setActiveFile(problemData.type === 'choice' ? 'answers.json' : (Object.keys(problemData.template_files || {})[0] ?? Object.keys(recoveredFiles)[0] ?? 'main.cpp'));
      setRestoredSubmissionId(latestSubmission?.id ?? null);
      setDraftSavedAt(draftToSave);
      setHasPendingDraftSave(false);

      if (latestSubmission) {
        try {
          const subResult = await api.get<SubmissionResponse>(`/submissions/${latestSubmission.id}`);
          setSubmission(subResult.data);
        } catch (e) {
          console.error('Failed to load latest submission details', e);
        }
      }
    } catch {
      setError('\u9898\u76ee\u5de5\u4f5c\u53f0\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setLoading(false);
    }
  }, [id, isAuthenticated, user]);

  useEffect(() => {
    void loadWorkspace();
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, [loadWorkspace]);

  useEffect(() => {
    latestProblemIdRef.current = id ?? null;
  }, [id]);

  useEffect(() => {
    latestFileContentsRef.current = fileContents;
  }, [fileContents]);

  useEffect(() => {
    if (!id) {
      draftSaveRef.current?.cancel();
      draftSaveRef.current = null;
      return;
    }

    const debouncedSave = debounce((problemId: string, files: Record<string, string>) => {
      if (problem) {
        persistDraft(problemId, files, problem);
      }
    }, AUTO_SAVE_DELAY_MS);
    draftSaveRef.current = debouncedSave;

    return () => {
      debouncedSave.cancel();
      if (latestProblemIdRef.current && Object.keys(latestFileContentsRef.current).length && problem) {
        persistDraft(latestProblemIdRef.current, latestFileContentsRef.current, problem);
      }
      if (draftSaveRef.current === debouncedSave) {
        draftSaveRef.current = null;
      }
    };
  }, [id, problem]);

  function updateCode(value: string, fileName?: string) {
    const targetFile = fileName || activeFile;
    if (!targetFile) {
      return;
    }

    const nextFiles = { ...latestFileContentsRef.current, [targetFile]: value };
    setFileContents(nextFiles);

    if (id) {
      draftSaveRef.current?.(id, nextFiles);
      setHasPendingDraftSave(true);
    }

    if (restoredSubmissionId !== null) {
      setRestoredSubmissionId(null);
    }
  }

  async function restoreSubmissionCode(historyItem: ProblemSubmissionHistoryItem) {
    if (!problem) return;
    const readonlySet = new Set(problem.readonly_files ?? []);
    const mergedFiles = { ...(problem.template_files || {}) };
    for (const [name, content] of Object.entries(historyItem.code)) {
      if (!readonlySet.has(name)) {
        mergedFiles[name] = content;
      }
    }
    setFileContents(mergedFiles);
    setActiveFile(problem.type === 'choice' ? 'answers.json' : (Object.keys(problem.template_files || {})[0] ?? Object.keys(mergedFiles)[0] ?? 'main.cpp'));
    setRestoredSubmissionId(historyItem.id);
    setEditorVersion((v) => v + 1);

    try {
      const { data } = await api.get<SubmissionResponse>(`/submissions/${historyItem.id}`);
      setSubmission(data);
    } catch (e) {
      console.error('Failed to load restored submission details', e);
    }
  }

  async function handleSubmit() {
    if (!problem) return;
    if (!isAuthenticated || !user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }

    setError('');
    setIsSubmitting(true);
    setSubmission(null);
    setActiveTab('console');
    setRestoredSubmissionId(null);

    try {
      const { data } = await api.post<SubmissionQueued>('/submissions', {
        problem_id: problem.id,
        user_id: user.id,
        code: fileContents,
      });
      await pollSubmission(data.submission_id);
    } catch {
      setIsSubmitting(false);
      setError('\u63d0\u4ea4\u8bc4\u6d4b\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    }
  }

  async function pollSubmission(submissionId: number) {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
    }

    const fetchStatus = async () => {
      const { data } = await api.get<SubmissionResponse>(`/submissions/${submissionId}`);
      setSubmission(data);
      setSubmissionHistory((current) => mergeSubmissionIntoHistory(current, data));
      if (!POLLABLE_STATUSES.has(data.status)) {
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setIsSubmitting(false);
        setActiveTab('console');
      }
    };

    await fetchStatus();
    pollRef.current = window.setInterval(() => {
      void fetchStatus();
    }, 2000);
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">\u6b63\u5728\u52a0\u8f7d\u4ee3\u7801\u5de5\u4f5c\u53f0...</div>;
  }

  if (!problem) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-red-300">{error || '\u9898\u76ee\u4e0d\u5b58\u5728\u3002'}</div>;
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => navigate('/')} className="absolute left-6 top-3 z-50 rounded-md p-2 transition-colors hover:bg-secondary/50">
        <ArrowLeft className="h-5 w-5 text-muted-foreground" />
      </button>
      <WorkspacePanels
        problem={problem}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        fileOrder={fileOrder}
        activeFile={activeFile}
        onFileChange={setActiveFile}
        fileContents={fileContents}
        onCodeChange={updateCode}
        editorVersion={editorVersion}
        draftStatusLabel={draftStatusLabel}
        isSubmitting={isSubmitting}
        submission={submission}
        submissionHistory={submissionHistory}
        restoredSubmissionId={restoredSubmissionId}
        onRestoreSubmission={restoreSubmissionCode}
        onSubmit={() => void handleSubmit()}
      />
      {error ? <div className="absolute bottom-6 left-6 rounded border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">{error}</div> : null}
    </div>
  );
}

function mergeSubmissionIntoHistory(
  history: ProblemSubmissionHistoryItem[],
  submission: SubmissionResponse,
): ProblemSubmissionHistoryItem[] {
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

function buildDraftStorageKey(problemId: string) {
  return `${DRAFT_STORAGE_KEY_PREFIX}${problemId}`;
}

function computeTemplateHash(problem: ProblemDetail): string {
  const readonlySet = new Set(problem.readonly_files ?? []);
  const sortedReadonlyFiles = (problem.readonly_files ?? []).slice().sort();
  const parts: string[] = [
    String(problem.id),
    problem.updated_at,
    ...sortedReadonlyFiles.map((name) => `ro:${name}=${(problem.template_files || {})[name] ?? ''}`),
  ];
  const sortedAllNames = Object.keys(problem.template_files || {}).sort();
  for (const name of sortedAllNames) {
    if (!readonlySet.has(name)) {
      parts.push(`tpl:${name}`);
    }
  }
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `v1_${Math.abs(hash).toString(36)}`;
}

function readLocalProblemDraft(problemId: string): LocalProblemDraft | null {
  try {
    const raw = localStorage.getItem(buildDraftStorageKey(problemId));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isLocalProblemDraft(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalProblemDraft(problemId: string, files: Record<string, string>, templateHash: string): string | null {
  try {
    const savedAt = new Date().toISOString();
    const payload: LocalProblemDraft = { savedAt, files, templateHash };
    localStorage.setItem(buildDraftStorageKey(problemId), JSON.stringify(payload));
    return savedAt;
  } catch {
    return null;
  }
}

function clearLocalProblemDraft(problemId: string) {
  try {
    localStorage.removeItem(buildDraftStorageKey(problemId));
  } catch {
    // ignore
  }
}

function isLocalProblemDraft(value: unknown): value is LocalProblemDraft {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { savedAt?: unknown; files?: unknown; templateHash?: unknown };
  return typeof candidate.savedAt === 'string' && isStringRecord(candidate.files) && typeof candidate.templateHash === 'string';
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

function formatDraftTimestamp(value: string) {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '--:--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate);
}
