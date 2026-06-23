import { ArrowLeft, Clock, PenTool, Plus, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { ExamListItem } from '../../types/oj';

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '未开始', color: 'text-amber-400' },
  in_progress: { label: '进行中', color: 'text-emerald-400' },
  paused: { label: '已暂停', color: 'text-amber-400' },
  completed: { label: '已完成', color: 'text-muted-foreground' },
};

export default function ExamListPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/exams' } });
      return;
    }
    void loadExams();
  }, []);

  async function loadExams() {
    setLoading(true);
    try {
      const { data } = await api.get<ExamListItem[]>('/exams');
      setExams(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => navigate('/')} className="rounded-md p-2 transition-colors hover:bg-secondary/50">
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">考试列表</h1>
              <p className="text-sm text-muted-foreground">管理你的模拟考试</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/exam/create')}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            创建考试
          </button>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">加载中...</div>
        ) : exams.length === 0 ? (
          <div className="text-center py-16">
            <PenTool className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground mb-4">暂无考试记录</p>
            <button
              type="button"
              onClick={() => navigate('/exam/create')}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              创建第一场考试
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {exams.map((exam) => {
              const status = statusLabels[exam.status] ?? { label: exam.status, color: 'text-muted-foreground' };
              const isActive = exam.status === 'in_progress' || exam.status === 'paused';
              const isCompleted = exam.status === 'completed';
              const targetPath = isCompleted ? `/exam/${exam.id}/results` : `/exam/${exam.id}`;

              return (
                <Link
                  key={exam.id}
                  to={targetPath}
                  className={`block rounded-xl border p-5 transition ${
                    isActive
                      ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
                      : isCompleted
                        ? 'border-border/50 bg-card/40 hover:bg-card/60'
                        : 'border-border/50 bg-card/40 hover:bg-card/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-semibold text-foreground truncate">{exam.title}</h3>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.color} border-current/30`}>
                          {status.label}
                        </span>
                        {isActive ? (
                          <span className="shrink-0 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {exam.duration_minutes} 分钟
                        </span>
                        <span>{exam.problem_ids.length} 道题</span>
                        {exam.total_score != null ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Trophy className="h-3.5 w-3.5" />
                            {exam.total_score.toFixed(1)} 分
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
