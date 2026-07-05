import { motion, AnimatePresence } from 'framer-motion';
import {
  Edit3,
  Plus,
  Trash2,
  Zap,
  Shield,
  AlertTriangle,
  Search,
  Users,
  BookOpen,
  Calendar,
  Activity,
  CheckCircle2,
  MinusCircle,
  HelpCircle,
  X,
} from 'lucide-react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { api } from '../../lib/api';
import type {
  AdminProblemListItem,
  AdminProblemListResponse,
  AdminUserStats,
  AdminUserListResponse,
  AdminUserProblemProgress,
} from '../../types/oj';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Input } from '../../components/ui/input';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../components/ui/accordion';
import { useAuthStore } from '../../store/authStore';

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
  const currentUser = useAuthStore((state) => state.user);

  // Tab State
  const [activeTab, setActiveTab] = useState<'problems' | 'users'>('problems');

  // Problems State
  const [problems, setProblems] = useState<AdminProblemListItem[]>([]);
  const [totalProblems, setTotalProblems] = useState(0);
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [problemsError, setProblemsError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminProblemListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Users State
  const [users, setUsers] = useState<AdminUserStats[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSortField, setUserSortField] = useState<'id' | 'ac' | 'submissions' | 'rate'>('id');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('asc');
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUserStats | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Single User Progress Detail State
  const [selectedUser, setSelectedUser] = useState<AdminUserStats | null>(null);
  const [userProgress, setUserProgress] = useState<AdminUserProblemProgress[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);

  // Fetch problems list
  async function loadProblems() {
    setProblemsLoading(true);
    setProblemsError('');
    try {
      const { data } = await api.get<AdminProblemListResponse>('/admin/problems', { params: { page: 1, page_size: 100 } });
      setProblems(data.items);
      setTotalProblems(data.total);
    } catch {
      setProblemsError('题目列表加载失败，请确认管理员权限。');
    } finally {
      setProblemsLoading(false);
    }
  }

  // Fetch users list
  async function loadUsers() {
    setUsersLoading(true);
    setUsersError('');
    try {
      const { data } = await api.get<AdminUserListResponse>('/admin/users');
      setUsers(data.users);
    } catch {
      setUsersError('用户数据加载失败，请确认管理员权限。');
    } finally {
      setUsersLoading(false);
    }
  }

  // Fetch selected user's detailed progress
  async function loadUserProgress(userId: number) {
    setProgressLoading(true);
    try {
      const { data } = await api.get<AdminUserProblemProgress[]>(`/admin/users/${userId}/progress`);
      setUserProgress(data);
    } catch {
      // Silently catch error or show in dialog
    } finally {
      setProgressLoading(false);
    }
  }

  useEffect(() => {
    void loadProblems();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      void loadUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedUser) {
      void loadUserProgress(selectedUser.id);
    } else {
      setUserProgress([]);
    }
  }, [selectedUser]);

  // Handle problem delete
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/problems/${deleteTarget.id}`);
      setProblems((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setTotalProblems((prev) => prev - 1);
      setDeleteTarget(null);
    } catch {
      setProblemsError('删除失败，请稍后重试。');
    } finally {
      setDeleting(false);
    }
  }

  // Handle user delete
  async function confirmDeleteUser() {
    if (!deleteUserTarget) return;
    setDeletingUser(true);
    try {
      await api.delete(`/admin/users/${deleteUserTarget.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteUserTarget.id));
      setDeleteUserTarget(null);
    } catch {
      setUsersError('删除用户失败，请稍后重试。');
    } finally {
      setDeletingUser(false);
    }
  }

  // User list search filtering
  const filteredUsers = useMemo(() => {
    let result = [...users];

    // Filter by search query
    if (userSearchQuery.trim()) {
      const query = userSearchQuery.toLowerCase().trim();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(query) ||
          (u.full_name && u.full_name.toLowerCase().includes(query)) ||
          u.email.toLowerCase().includes(query)
      );
    }

    // Sort by field
    result.sort((a, b) => {
      let comparison = 0;
      if (userSortField === 'id') {
        comparison = a.id - b.id;
      } else if (userSortField === 'ac') {
        comparison = a.ac_problems_count - b.ac_problems_count;
      } else if (userSortField === 'submissions') {
        comparison = a.total_submissions - b.total_submissions;
      } else if (userSortField === 'rate') {
        comparison = a.ac_rate - b.ac_rate;
      }
      return userSortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [users, userSearchQuery, userSortField, userSortOrder]);

  const toggleSort = (field: 'id' | 'ac' | 'submissions' | 'rate') => {
    if (userSortField === field) {
      setUserSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setUserSortField(field);
      setUserSortOrder('desc'); // Default to descending
    }
  };

  // Standardize and map week categories for selection details
  const extractWeek = useCallback((slug: string, title: string): string => {
    const titleMatch = title.match(/\[(第[^\]]+周|Week\s*\d+|[^\]]+考试|[^\]]+测验)\]/i);
    let rawWeek = '';
    if (titleMatch) {
      rawWeek = titleMatch[1];
    } else {
      const slugMatch = slug.match(/^week(\d+)/i);
      if (slugMatch) {
        rawWeek = `第${slugMatch[1]}周`;
      } else if (slug.includes('midterm') || title.includes('期中')) {
        return '期中考试 / 测验';
      } else {
        return '公开题库 / 其他';
      }
    }

    // Normalizing
    const cnToArMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15, '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20
    };
    const numMatch = rawWeek.match(/\d+/);
    if (numMatch) {
      return `第${numMatch[0]}周`;
    }
    const cnMatch = rawWeek.match(/第([^周]+)周/);
    if (cnMatch) {
      const cnPart = cnMatch[1].trim();
      if (cnToArMap[cnPart]) {
        return `第${cnToArMap[cnPart]}周`;
      }
    }
    return rawWeek;
  }, []);

  const getMajorCategory = useCallback((slug: string, title: string, tags: string[]): string => {
    const weekStr = extractWeek(slug, title);
    const weekNumMatch = weekStr.match(/\d+/);

    if (weekNumMatch) {
      const weekNum = parseInt(weekNumMatch[0], 10);
      if (weekNum === 1 || weekNum === 2) return '01-从C到C++';
      if (weekNum === 3 || weekNum === 4) return '02-数据抽象和类I';
      if (weekNum === 5 || weekNum === 6) return '03-数据抽象和类II';
      if (weekNum === 7 || weekNum === 9) return '04-运算符重载';
      if (weekNum === 10 || weekNum === 11 || weekNum === 12) return '05-继承和派生';
      if (weekNum === 13 || weekNum === 14) return '06-多态';
      if (weekNum === 15) return '07-模板';
      if (weekNum === 16 || weekNum === 17) return '08-STL';
    }

    const tagsLower = (tags || []).map((t) => t.toLowerCase());
    if (tagsLower.some((t) => ['引用', '指针', '内存', '动态内存', '命名空间', 'namespace'].some((k) => t.includes(k)))) {
      return '01-从C到C++';
    }
    if (tagsLower.some((t) => ['构造函数', '析构函数', '类', '对象', 'this'].some((k) => t.includes(k)))) {
      return '02-数据抽象和类I';
    }
    if (tagsLower.some((t) => ['拷贝', '深拷贝', '浅拷贝', '静态', '友元', 'static', 'friend'].some((k) => t.includes(k)))) {
      return '03-数据抽象和类II';
    }
    if (tagsLower.some((t) => ['运算符重载', '仿函数', '函数对象', '流', 'operator'].some((k) => t.includes(k)))) {
      return '04-运算符重载';
    }
    if (tagsLower.some((t) => ['继承', '派生', '基类', '派生类', '虚继承'].some((k) => t.includes(k)))) {
      return '05-继承和派生';
    }
    if (tagsLower.some((t) => ['多态', '虚函数', '纯虚函数', '抽象类'].some((k) => t.includes(k)))) {
      return '06-多态';
    }
    if (tagsLower.some((t) => ['模板', '函数模板', '类模板', 'template'].some((k) => t.includes(k)))) {
      return '07-模板';
    }
    if (tagsLower.some((t) => ['stl', '容器', 'vector', 'list', 'map', 'set', 'string', 'algorithm', '算法'].some((k) => t.includes(k)))) {
      return '08-STL';
    }
    return '09-综合应用 / 其他';
  }, [extractWeek]);

  // Group user progress list into 9 core categories
  const groupedProgress = useMemo(() => {
    const groups: Record<string, AdminUserProblemProgress[]> = {
      '01-从C到C++': [],
      '02-数据抽象和类I': [],
      '03-数据抽象和类II': [],
      '04-运算符重载': [],
      '05-继承和派生': [],
      '06-多态': [],
      '07-模板': [],
      '08-STL': [],
      '09-综合应用 / 其他': [],
    };

    userProgress.forEach((item) => {
      const category = getMajorCategory(item.slug, item.title, item.tags);
      if (groups[category]) {
        groups[category].push(item);
      } else {
        groups['09-综合应用 / 其他'].push(item);
      }
    });

    return groups;
  }, [userProgress, getMajorCategory]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 py-6">
        {/* Navigation Tabs */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="size-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold">管理端控制台</h1>
            </div>
            <p className="text-sm text-muted-foreground">管理 OJ 题目列表与全库学生答题进度看板</p>
          </div>

          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'problems' | 'users')} className="w-fit">
            <TabsList className="bg-white/[0.03] border border-white/[0.06] rounded-xl">
              <TabsTrigger value="problems" className="flex items-center gap-2">
                <BookOpen className="size-4" />
                题目管理
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="size-4" />
                用户答题统计
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Tab Content A: Problems management */}
        {activeTab === 'problems' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">共 {totalProblems} 道题目 · 含对拍配置与评测用例数据</span>
              <Button onClick={() => navigate('/admin/problems/new')}>
                <Plus className="size-4" />
                新建题目
              </Button>
            </div>

            {problemsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{problemsError}</div>
            ) : null}

            {problemsLoading ? (
              <div className="glass-card p-12 text-sm text-muted-foreground text-center">正在加载题目列表...</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] bg-white/[0.03] px-6 py-3 text-sm font-semibold text-muted-foreground">
                  <div className="col-span-1">ID</div>
                  <div className="col-span-3">题目名称</div>
                  <div className="col-span-2">Slug</div>
                  <div className="col-span-3">核心标签</div>
                  <div className="col-span-1">难度</div>
                  <div className="col-span-2 text-right">操作</div>
                </div>
                <motion.div variants={containerVariants} initial="hidden" animate="visible">
                  {problems.map((problem, idx) => (
                    <motion.div
                      key={problem.id}
                      variants={rowVariants}
                      custom={idx}
                      className="grid grid-cols-12 items-center gap-4 px-6 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="col-span-1 font-mono text-sm text-muted-foreground">{problem.id}</div>
                      <div className="col-span-3 flex items-center gap-2">
                        <span className="text-foreground font-medium">{problem.title}</span>
                        {problem.has_fuzz ? (
                          <Badge variant="outline" className="text-[10px] gap-0.5 border-indigo-500/30 text-indigo-400 bg-indigo-500/5">
                            <Zap className="h-3 w-3 fill-indigo-400/20" />
                            对拍
                          </Badge>
                        ) : null}
                      </div>
                      <div className="col-span-2 font-mono text-xs text-muted-foreground">{problem.slug}</div>
                      <div className="col-span-3 flex flex-wrap gap-1.5">
                        {problem.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] text-muted-foreground border-white/[0.08]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="col-span-1 text-sm text-muted-foreground">{problem.difficulty ?? '-'}</div>
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/admin/problems/${problem.id}`)}>
                          <Edit3 className="h-3 w-3" />
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteTarget(problem)} className="text-destructive hover:bg-destructive/10 hover:text-destructive border-white/[0.06]">
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
        )}

        {/* Tab Content B: Users solve statistics dashboard */}
        {activeTab === 'users' && (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">共 {filteredUsers.length} 位注册用户</span>

              {/* User search bar */}
              <div className="relative w-full max-w-[280px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="搜索用户名、姓名、邮箱..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pl-9 bg-white/[0.03] border-white/[0.06]"
                />
              </div>
            </div>

            {usersError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{usersError}</div>
            ) : null}

            {usersLoading ? (
              <div className="glass-card p-12 text-sm text-muted-foreground text-center">正在加载用户数据...</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] bg-white/[0.03] px-6 py-3 text-sm font-semibold text-muted-foreground">
                  <div className="col-span-1 cursor-pointer select-none flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('id')}>
                    ID
                    {userSortField === 'id' && (userSortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="col-span-3">基本信息</div>
                  <div className="col-span-2">邮箱</div>
                  <div className="col-span-2 cursor-pointer select-none flex items-center justify-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('ac')}>
                    已通过题目
                    {userSortField === 'ac' && (userSortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="col-span-1 cursor-pointer select-none flex items-center justify-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('submissions')}>
                    提交数
                    {userSortField === 'submissions' && (userSortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="col-span-2 cursor-pointer select-none flex items-center justify-end gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('rate')}>
                    AC 提交率
                    {userSortField === 'rate' && (userSortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="col-span-1 text-right">操作</div>
                </div>

                <motion.div variants={containerVariants} initial="hidden" animate="visible">
                  {filteredUsers.map((u, idx) => (
                    <motion.div
                      key={u.id}
                      variants={rowVariants}
                      custom={idx}
                      onClick={() => setSelectedUser(u)}
                      className="grid grid-cols-12 items-center gap-4 px-6 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <div className="col-span-1 font-mono text-sm text-muted-foreground">{u.id}</div>
                      <div className="col-span-3 flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-semibold">{u.full_name || u.username}</span>
                          {u.is_admin ? (
                            <Badge className="text-[9px] h-4 leading-none bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
                              Admin
                            </Badge>
                          ) : null}
                          {!u.is_active ? (
                            <Badge className="text-[9px] h-4 leading-none bg-destructive/10 text-destructive border-destructive/20">
                              禁用
                            </Badge>
                          ) : null}
                        </div>
                        {u.full_name ? <span className="text-xs text-muted-foreground mt-0.5">@{u.username}</span> : null}
                      </div>
                      <div className="col-span-2 text-sm text-muted-foreground truncate">{u.email}</div>
                      <div className="col-span-2 text-center text-foreground font-mono font-medium">
                        {u.ac_problems_count} <span className="text-xs text-muted-foreground font-sans">/ {u.attempted_problems_count}</span>
                      </div>
                      <div className="col-span-1 text-center text-foreground font-mono">
                        {u.total_submissions}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-2 pr-2">
                        <span className="font-mono text-sm font-semibold text-indigo-400">{(u.ac_rate * 100).toFixed(1)}%</span>
                        <div className="w-10 bg-white/[0.04] h-1 rounded-full overflow-hidden shrink-0">
                          <div className="bg-indigo-500 h-full" style={{ width: `${u.ac_rate * 100}%` }} />
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={u.id === currentUser?.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteUserTarget(u);
                          }}
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-full disabled:opacity-30 border-none"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-12 text-sm text-muted-foreground">没有找到匹配的用户。</div>
                  )}
                </motion.div>
              </div>
            )}
          </section>
        )}
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
              className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg border-white/[0.08]"
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

      {/* Delete User Confirmation Modal */}
      <AnimatePresence>
        {deleteUserTarget ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeleteUserTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg border-white/[0.08]"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full border border-destructive/30 bg-destructive/10 p-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold">确认删除用户</h3>
              </div>
              <p className="mb-6 text-sm text-muted-foreground">
                即将删除用户 <span className="font-mono">@{deleteUserTarget.username} ({deleteUserTarget.full_name || '无真实姓名'})</span>，
                该操作将**永久清空该用户的所有答题历史、代码提交记录和系统数据**，且不可恢复。
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDeleteUserTarget(null)}>
                  取消
                </Button>
                <Button variant="destructive" onClick={() => void confirmDeleteUser()} disabled={deletingUser}>
                  {deletingUser ? '删除中...' : '确认删除'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Sliding User Progress Detail Panel */}
      <AnimatePresence>
        {selectedUser ? (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm"
            />

            {/* Sliding Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 250 }}
              className="fixed right-0 top-0 bottom-0 z-[120] w-full max-w-2xl bg-card border-l border-white/[0.08] shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-lg">
                    {selectedUser.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground leading-none mb-1">
                      {selectedUser.full_name || selectedUser.username}
                    </h2>
                    <p className="text-xs text-muted-foreground">@{selectedUser.username} · {selectedUser.email}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedUser(null)} className="rounded-full size-8">
                  <X className="size-4" />
                </Button>
              </div>

              {/* Stats Overview */}
              <div className="p-6 bg-white/[0.01] border-b border-white/[0.06] grid grid-cols-3 gap-4 text-center">
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="size-4 text-emerald-400 mb-1" />
                  <span className="text-xs text-muted-foreground">通过题目</span>
                  <span className="text-lg font-mono font-bold mt-0.5">{selectedUser.ac_problems_count}</span>
                </div>
                <div className="flex flex-col items-center">
                  <Activity className="size-4 text-indigo-400 mb-1" />
                  <span className="text-xs text-muted-foreground">已尝试题目</span>
                  <span className="text-lg font-mono font-bold mt-0.5">{selectedUser.attempted_problems_count}</span>
                </div>
                <div className="flex flex-col items-center">
                  <Calendar className="size-4 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">总提交次数</span>
                  <span className="text-lg font-mono font-bold mt-0.5">{selectedUser.total_submissions}</span>
                </div>
              </div>

              {/* Progress Accordion Container */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {progressLoading ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">正在加载详细答题进度...</div>
                ) : (
                  <Accordion type="multiple" className="space-y-3">
                    {Object.keys(groupedProgress).sort().map((categoryKey) => {
                      const list = groupedProgress[categoryKey];
                      const acCount = list.filter((p) => p.status === 'AC').length;
                      const totalCount = list.length;
                      const percent = totalCount > 0 ? (acCount / totalCount) * 100 : 0;

                      if (totalCount === 0) return null; // Hide categories with no problems

                      return (
                        <AccordionItem
                          key={categoryKey}
                          value={categoryKey}
                          className="border border-white/[0.06] bg-white/[0.01] rounded-xl overflow-hidden"
                        >
                          <AccordionTrigger className="px-5 py-3 hover:bg-white/[0.02] hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-2">
                              <span className="text-sm font-semibold text-foreground">{categoryKey}</span>
                              <div className="flex items-center gap-3 ml-auto">
                                <span className="text-xs text-muted-foreground font-mono">
                                  {acCount} / {totalCount} AC
                                </span>
                                <div className="w-16 bg-white/[0.04] h-1 rounded-full overflow-hidden">
                                  <div className="bg-indigo-500 h-full" style={{ width: `${percent}%` }} />
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-5 pb-4 pt-1 bg-black/[0.1] border-t border-white/[0.04]">
                            <div className="space-y-3 pt-2">
                              {list.map((prog) => (
                                <div key={prog.problem_id} className="flex items-start justify-between gap-4 py-1.5 border-b border-white/[0.03] last:border-b-0">
                                  {/* Left details */}
                                  <div className="flex items-start gap-2.5">
                                    {prog.status === 'AC' ? (
                                      <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                                    ) : prog.status === 'Attempted' ? (
                                      <MinusCircle className="size-4 text-amber-400 mt-0.5 shrink-0" />
                                    ) : (
                                      <HelpCircle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                                    )}
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium text-foreground leading-tight">
                                        {prog.title}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground font-mono mt-0.5">#{prog.problem_id} · {prog.slug}</span>
                                    </div>
                                  </div>

                                  {/* Right details */}
                                  <div className="text-right text-xs text-muted-foreground shrink-0 font-mono">
                                    {prog.total_submissions > 0 ? (
                                      <div className="flex flex-col items-end">
                                        <span className="text-foreground">已交 {prog.total_submissions} 次</span>
                                        {prog.status === 'AC' && (prog.best_runtime_ms !== null || prog.best_memory_kb !== null) ? (
                                          <span className="text-[10px] text-indigo-400/80 mt-0.5">
                                            {prog.best_runtime_ms !== null ? `${prog.best_runtime_ms}ms` : ''} 
                                            {prog.best_runtime_ms !== null && prog.best_memory_kb !== null ? ' / ' : ''}
                                            {prog.best_memory_kb !== null ? `${(prog.best_memory_kb / 1024).toFixed(1)}M` : ''}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <span className="opacity-40">未尝试</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}
