import { Binary, BrainCircuit, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ProblemTable } from '../components/ProblemTable';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { ProblemListItem, ProblemListResponse } from '../types/oj';
import { Aurora, SpotlightCard, BlurText } from '../components/react-bits';

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProblems, setTotalProblems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProblems = useCallback(async (page: number) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<ProblemListResponse>('/problems', {
        params: { page, page_size: PAGE_SIZE },
      });
      setProblems(data.items);
      setCurrentPage(data.page);
      setTotalProblems(data.total);
    } catch {
      setError('题目列表加载失败，请确认前端代理和后端服务已连接。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProblems(currentPage);
  }, [currentPage, isAuthenticated, loadProblems, user?.id]);

  const problemCount = useMemo(() => totalProblems, [totalProblems]);
  const taggedProblemCount = useMemo(() => problems.filter((problem) => problem.tags.length > 0).length, [problems]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalProblems / PAGE_SIZE)), [totalProblems]);
  const visiblePages = useMemo(() => getVisiblePages(currentPage, totalPages), [currentPage, totalPages]);
  const pageRangeLabel = useMemo(() => {
    if (!totalProblems || !problems.length) {
      return '当前没有可展示的题目。';
    }

    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = start + problems.length - 1;
    return `当前显示第 ${start}-${end} 题，共 ${totalProblems} 题`;
  }, [currentPage, problems.length, totalProblems]);

  function handlePageChange(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) {
      return;
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 py-6">
        {/* Hero Section with Aurora */}
        <div className="relative mb-10 overflow-hidden rounded-2xl border border-white/[0.06]" style={{ minHeight: 180 }}>
          <Aurora colorStops={['#6366f1', '#a855f7', '#ec4899']} amplitude={1.2} blend={0.4} speed={0.8} />
          <div className="relative z-10 px-8 py-10 sm:px-12 sm:py-14">
            <BlurText
              text="Mak's OJ"
              delay={80}
              animateBy="words"
              direction="top"
              className="text-4xl sm:text-5xl font-bold text-white mb-2"
            />
            {isAuthenticated && user && (
              <p className="text-white/50 text-sm">
                Welcome back, {user.username}
              </p>
            )}
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-8">
          <StatCard
            title="题目数量"
            value={String(problemCount)}
            description="当前可读取的题目总数"
            icon={<Binary className="size-4 text-muted-foreground" />}
            spotlightColor="rgba(255, 255, 255, 0.08)"
          />
          <StatCard
            title="标签覆盖"
            value={String(taggedProblemCount)}
            description="已带标签的题目数量"
            icon={<BrainCircuit className="size-4 text-muted-foreground" />}
            spotlightColor="rgba(255, 255, 255, 0.08)"
          />
          <StatCard
            title="当前状态"
            value={isAuthenticated && user ? user.username : '游客'}
            description={isAuthenticated ? '已登录，可直接提交评测。' : '登录后可提交评测并查看学习画像。'}
            icon={<Sparkles className="size-4 text-muted-foreground" />}
            spotlightColor="rgba(255, 255, 255, 0.08)"
          />
        </div>

        {/* Problem List */}
        <section>
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">题目列表</h2>
              <p className="text-sm text-muted-foreground">点击任意题目即可进入代码工作台。</p>
            </div>
            <div className="text-sm text-muted-foreground">
              {pageRangeLabel}
            </div>
          </div>

          {loading ? (
            <div className="glass-card p-8 text-sm text-muted-foreground text-center">正在加载题目列表...</div>
          ) : error ? (
            <div className="glass-card p-8 text-sm text-destructive text-center border-destructive/20">{error}</div>
          ) : (
            <div className="space-y-4">
              <ProblemTable problems={problems} onSelect={(problemId) => navigate(`/problem/${problemId}`)} />
              <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  第 <span className="font-mono text-foreground">{currentPage}</span> /{' '}
                  <span className="font-mono text-foreground">{totalPages}</span> 页
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-sm transition hover:bg-white/[0.08] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => handlePageChange(page)}
                      className={`min-w-9 rounded-lg px-3 py-1.5 text-sm transition ${
                        page === currentPage
                          ? 'bg-foreground text-background'
                          : 'border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.08] hover:text-foreground'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-sm transition hover:bg-white/[0.08] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const normalizedStart = Math.max(1, end - 4);
  return Array.from({ length: end - normalizedStart + 1 }, (_, index) => normalizedStart + index);
}

function StatCard({
  title,
  value,
  description,
  icon,
  spotlightColor,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
  spotlightColor?: string;
}) {
  return (
    <SpotlightCard className="p-5 sm:p-6" spotlightColor={spotlightColor}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </SpotlightCard>
  );
}
