import { ArrowLeft, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { ExamResults } from '../../types/oj';

export default function ExamResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [results, setResults] = useState<ExamResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/exam/${examId}/results` } });
      return;
    }
    void loadResults();
  }, [examId]);

  async function loadResults() {
    if (!examId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<ExamResults>(`/exams/${examId}/results`);
      setResults(data);
    } catch {
      setError('加载考试结果失败。');
    } finally {
      setLoading(false);
    }
  }

  const formatElapsed = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h} 小时 ${m} 分 ${s} 秒`;
    if (m > 0) return `${m} 分 ${s} 秒`;
    return `${s} 秒`;
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">正在加载考试结果...</div>;
  }
  if (error || !results) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-red-300">{error || '结果不存在。'}</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-8 rounded-md p-2 transition-colors hover:bg-secondary/50"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>

        <div className="mb-10">
          <h1 className="mb-2 text-3xl font-bold text-foreground">{results.title}</h1>
          <p className="text-muted-foreground">
            实际用时 {formatElapsed(results.elapsed_seconds)} · {results.duration_minutes} 分钟限时
          </p>
        </div>

        {/* Score summary card */}
        <div className="mb-8 rounded-2xl border border-border/50 bg-card/60 p-8 backdrop-blur-sm">
          <div className="flex items-end justify-between">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">总分</p>
              <p className="text-5xl font-bold" style={{ color: 'var(--primary)' }}>{results.total_score.toFixed(1)}</p>
              <p className="mt-1 text-sm text-muted-foreground">满分 100</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold text-foreground">
                {results.passed_count} <span className="text-base font-normal text-muted-foreground">/ {results.total_problems}</span>
              </p>
              <p className="text-sm text-muted-foreground">通过题数</p>
            </div>
          </div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-secondary/50">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${results.total_problems > 0 ? (results.passed_count / results.total_problems) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Per-problem results */}
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm">
          <div className="border-b border-border/50 px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">各题详情</h2>
          </div>
          <div className="divide-y divide-border/30">
            {results.problems.map((p, i) => (
              <div key={p.problem_id} className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-secondary/10">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm text-muted-foreground">#{i + 1}</span>
                  {p.passed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-400" />
                  )}
                  <div>
                    <Link
                      to={`/problem/${p.problem_id}`}
                      className="inline-flex items-center gap-1.5 font-mono text-sm text-foreground transition hover:text-primary"
                    >
                      {p.slug}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.status ? translateStatus(p.status) : '未提交'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-bold font-mono ${p.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.score.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground"> 分</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function translateStatus(status: string) {
  switch (status) {
    case 'AC': return '答案正确';
    case 'WA': return '答案错误';
    case 'CE': return '编译错误';
    case 'RE': return '运行时错误';
    case 'TLE': return '超时';
    case 'MLE': return '超内存';
    case 'Pending': return '等待评测';
    case 'Judging': return '评测中';
    default: return status;
  }
}
