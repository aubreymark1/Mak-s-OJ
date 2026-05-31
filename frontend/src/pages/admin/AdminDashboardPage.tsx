import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, Plus, Trash2, Zap, Shield, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { api } from '../../lib/api';
import type { AdminProblemListItem, AdminProblemListResponse } from '../../types/oj';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [problems, setProblems] = useState<AdminProblemListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminProblemListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void loadProblems();
  }, []);

  async function loadProblems() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<AdminProblemListResponse>('/admin/problems', { params: { page: 1, page_size: 100 } });
      setProblems(data.items);
      setTotal(data.total);
    } catch {
      setError('题目列表加载失败，请确认管理员权限。');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/problems/${deleteTarget.id}`);
      setProblems((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setTotal((prev) => prev - 1);
      setDeleteTarget(null);
    } catch {
      setError('删除失败，请稍后重试。');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="size-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold">题目管理</h1>
            </div>
            <p className="text-sm text-muted-foreground">共 {total} 道题目 · 含对拍配置、评测用例等完整数据</p>
          </div>
          <Button onClick={() => navigate('/admin/problems/new')}>
            <Plus className="size-4" />
            新建题目
          </Button>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}

        <section>
          {loading ? (
            <div className="rounded-lg border p-8 text-sm text-muted-foreground text-center">正在加载题目列表...</div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-12 gap-4 border-b bg-muted/30 px-4 py-3 text-sm font-medium text-muted-foreground">
                <div className="col-span-1">ID</div>
                <div className="col-span-3">题目名称</div>
                <div className="col-span-2">Slug</div>
                <div className="col-span-2">标签</div>
                <div className="col-span-1">难度</div>
                <div className="col-span-1">用例</div>
                <div className="col-span-2 text-right">操作</div>
              </div>
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {problems.map((problem) => (
                  <motion.div
                    key={problem.id}
                    variants={rowVariants}
                    className="grid grid-cols-12 items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 border-b"
                  >
                    <div className="col-span-1 font-mono text-sm text-muted-foreground">{problem.id}</div>
                    <div className="col-span-3 flex items-center gap-2">
                      <span className="text-foreground">{problem.title}</span>
                      {problem.has_fuzz ? (
                        <Badge variant="outline" className="text-[10px]">
                          <Zap className="h-3 w-3" />
                          Fuzz
                        </Badge>
                      ) : null}
                    </div>
                    <div className="col-span-2 font-mono text-xs text-muted-foreground">{problem.slug}</div>
                    <div className="col-span-2 flex flex-wrap gap-1">
                      {problem.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                    <div className="col-span-1 text-sm text-muted-foreground">{problem.difficulty ?? '-'}</div>
                    <div className="col-span-1 text-sm text-muted-foreground">{problem.judge_case_count}</div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/problems/${problem.id}`)}>
                        <Edit3 className="h-3 w-3" />
                        编辑
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(problem)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                        删除
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full border border-destructive/30 bg-destructive/10 p-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold">确认删除</h3>
              </div>
              <p className="mb-6 text-sm text-muted-foreground">
                即将删除题目 <span className="font-mono">#{deleteTarget.id} {deleteTarget.title}</span>，
                该操作不可撤销，且会级联删除所有关联的提交记录。
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  取消
                </Button>
                <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
                  {deleting ? '删除中...' : '确认删除'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}
