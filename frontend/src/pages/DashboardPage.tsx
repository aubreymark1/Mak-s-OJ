import { Binary, BrainCircuit, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ProblemTable } from '../components/ProblemTable';
import { Card, CardContent } from '../components/ui/card';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { ProblemListItem, ProblemListResponse } from '../types/oj';

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
        {/* Stats Summary */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
          <StatCard
            title="题目数量"
            value={String(problemCount)}
            description="当前前端可读取的题目总数"
            icon={<Binary className="size-4 text-muted-foreground" />}
          />
          <StatCard
            title="标签覆盖"
            value={String(taggedProblemCount)}
            description="当前页里已经带标签的题目数量"
            icon={<BrainCircuit className="size-4 text-muted-foreground" />}
          />
          <StatCard
            title="当前状态"
            value={isAuthenticated && user ? user.username : '游客'}
            description={isAuthenticated ? '已登录，可直接提交评测。' : '登录后可提交评测并查看学习画像。'}
            icon={<Sparkles className="size-4 text-muted-foreground" />}
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
            <div className="rounded-lg border p-8 text-sm text-muted-foreground text-center">正在加载题目列表...</div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-sm text-destructive text-center">{error}</div>
          ) : (
            <div className="space-y-4">
              <ProblemTable problems={problems} onSelect={(problemId) => navigate(`/problem/${problemId}`)} />
              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  第 <span className="font-mono text-foreground">{currentPage}</span> /{' '}
                  <span className="font-mono text-foreground">{totalPages}</span> 页
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="rounded-md border px-3 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => handlePageChange(page)}
                      className={`min-w-9 rounded-md border px-3 py-1.5 text-sm transition ${
                        page === currentPage
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="rounded-md border px-3 py-1.5 text-sm transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">{title}</span>
          {icon}
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
