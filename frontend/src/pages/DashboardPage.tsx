import { Binary, BrainCircuit, Sparkles, Search, FolderKanban, Tag as TagIcon, Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '../components/AppShell';
import { ProblemTable } from '../components/ProblemTable';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { ProblemListItem, ProblemListResponse } from '../types/oj';
import { Aurora, SpotlightCard, BlurText } from '../components/react-bits';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

/** 数字递增动画 hook */
function useCountUp(target: number, duration = 1600, enabled = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || target <= 0) {
      setValue(target);
      return;
    }

    setValue(0);
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out-expo 缓动：先快后慢，数字跳动感强
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled]);

  return value;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupType, setGroupType] = useState<'week' | 'tag'>('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [openValues, setOpenValues] = useState<string[]>([]);

  const loadProblems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<ProblemListResponse>('/problems', {
        // 一次性获取所有题目以便全局分组与搜索
        params: { page: 1, page_size: 1000 },
      });
      setProblems(data.items);
    } catch {
      setError('题目列表加载失败，请确认前端代理和后端服务已连接。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProblems();
  }, [isAuthenticated, loadProblems, user?.id]);

  // 搜索关键字过滤
  const filteredProblems = useMemo(() => {
    if (!searchQuery.trim()) return problems;
    const query = searchQuery.toLowerCase().trim();
    return problems.filter((p) => {
      return (
        p.title.toLowerCase().includes(query) ||
        p.slug.toLowerCase().includes(query) ||
        p.id.toString().includes(query) ||
        p.tags.some((t) => t.toLowerCase().includes(query))
      );
    });
  }, [problems, searchQuery]);

  // 从题目名称（如 `[第九周] xxx`）或 slug（如 `week9-xxx`）中动态解析教学周次
  const extractWeek = useCallback((problem: ProblemListItem): string => {
    const titleMatch = problem.title.match(/\[(第[^\]]+周|Week\s*\d+|[^\]]+考试|[^\]]+测验)\]/i);
    if (titleMatch) {
      return titleMatch[1];
    }
    const slugMatch = problem.slug.match(/^week(\d+)/i);
    if (slugMatch) {
      return `第${slugMatch[1]}周`;
    }
    if (problem.slug.includes('midterm') || problem.title.includes('期中')) {
      return '期中考试 / 测验';
    }
    return '公开题库 / 其他';
  }, []);

  // 周次自定义排序规则
  const sortWeeks = useCallback((a: string, b: string): number => {
    const getWeight = (s: string) => {
      if (s.includes('期中')) return 1000;
      if (s.includes('其他') || s.includes('公开')) return 2000;
      const numMatch = s.match(/\d+/);
      if (numMatch) return parseInt(numMatch[0]);

      const cnNums: Record<string, number> = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15, '十六': 16, '十七': 17, '十八': 18
      };
      for (const key in cnNums) {
        if (s.includes(key)) return cnNums[key];
      }
      return 999;
    };
    return getWeight(a) - getWeight(b);
  }, []);

  // 按周次分组
  const weekGroups = useMemo(() => {
    const groups: Record<string, ProblemListItem[]> = {};
    filteredProblems.forEach((problem) => {
      const week = extractWeek(problem);
      if (!groups[week]) groups[week] = [];
      groups[week].push(problem);
    });
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => b.id - a.id);
    });
    return groups;
  }, [filteredProblems, extractWeek]);

  // 按知识点/标签多重归类分组
  const tagGroups = useMemo(() => {
    const groups: Record<string, ProblemListItem[]> = {};
    filteredProblems.forEach((problem) => {
      const cleanTags = problem.tags.filter(
        (t) => !['c++', 'c++语言', 'cpp'].includes(t.toLowerCase())
      );
      if (cleanTags.length === 0) {
        const fallback = '其他知识点';
        if (!groups[fallback]) groups[fallback] = [];
        groups[fallback].push(problem);
      } else {
        cleanTags.forEach((tag) => {
          if (!groups[tag]) groups[tag] = [];
          if (!groups[tag].some((p) => p.id === problem.id)) {
            groups[tag].push(problem);
          }
        });
      }
    });
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => b.id - a.id);
    });
    return groups;
  }, [filteredProblems]);

  // 排序后的分组 Key
  const sortedGroupKeys = useMemo(() => {
    if (groupType === 'week') {
      return Object.keys(weekGroups).sort(sortWeeks);
    } else {
      return Object.keys(tagGroups).sort();
    }
  }, [groupType, weekGroups, tagGroups, sortWeeks]);

  // 当前激活的分组集合
  const activeGroups = useMemo(() => {
    return groupType === 'week' ? weekGroups : tagGroups;
  }, [groupType, weekGroups, tagGroups]);

  // 切换分组维度时，默认展开最新的一个分组
  const lastGroupType = useRef<'week' | 'tag'>('week');
  useEffect(() => {
    if (sortedGroupKeys.length > 0) {
      if (lastGroupType.current !== groupType || openValues.length === 0) {
        // 展开排序后的最后一个（通常为最新周次或末尾标签）
        setOpenValues([sortedGroupKeys[sortedGroupKeys.length - 1]]);
        lastGroupType.current = groupType;
      }
    }
  }, [groupType, sortedGroupKeys]);

  const handleExpandAll = () => setOpenValues(sortedGroupKeys);
  const handleCollapseAll = () => setOpenValues([]);

  // 统计数据
  const problemCount = useMemo(() => problems.length, [problems]);
  const taggedProblemCount = useMemo(() => problems.filter((problem) => problem.tags.length > 0).length, [problems]);

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
            <p className="text-white/50 text-sm">
              {isAuthenticated && user
                ? `Welcome back, ${user.username}`
                : 'Algorithm challenges, zero friction.'}
            </p>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-8">
          <StatCard
            title="题目数量"
            value={problemCount}
            description="当前可读取的题目总数"
            icon={<Binary className="size-4 text-muted-foreground" />}
            spotlightColor="rgba(255, 255, 255, 0.08)"
            index={0}
          />
          <StatCard
            title="标签覆盖"
            value={taggedProblemCount}
            description="已带标签的题目数量"
            icon={<BrainCircuit className="size-4 text-muted-foreground" />}
            spotlightColor="rgba(255, 255, 255, 0.08)"
            index={1}
          />
          <StatCard
            title="当前状态"
            value={isAuthenticated && user ? user.username : '游客'}
            description={isAuthenticated ? '已登录，可直接提交评测。' : '登录后可提交评测并查看学习画像。'}
            icon={<Sparkles className="size-4 text-muted-foreground" />}
            spotlightColor="rgba(255, 255, 255, 0.08)"
            index={2}
          />
        </div>

        {/* Header & Controls */}
        <section className="space-y-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">题库中心</h2>
              <p className="text-sm text-muted-foreground">根据教学进度或知识分类查找题目，点击即可进入开发工作台。</p>
            </div>
          </div>

          {/* Group Tabs & Controls Toolbar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between glass-card p-4">
            <Tabs value={groupType} onValueChange={(val) => setGroupType(val as 'week' | 'tag')} className="w-fit">
              <TabsList className="bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <TabsTrigger value="week" className="flex items-center gap-2">
                  <FolderKanban className="size-4" />
                  按课程周次
                </TabsTrigger>
                <TabsTrigger value="tag" className="flex items-center gap-2">
                  <TagIcon className="size-4" />
                  按核心知识点
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative w-full max-w-[280px] sm:w-[280px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="搜索题目、标签..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-white/[0.03] border-white/[0.06] text-sm"
                />
              </div>

              {/* Toggle Expand/Collapse */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExpandAll} className="h-9 px-3 text-xs bg-white/[0.03] border-white/[0.06]">
                  展开全部
                </Button>
                <Button variant="outline" size="sm" onClick={handleCollapseAll} className="h-9 px-3 text-xs bg-white/[0.03] border-white/[0.06]">
                  折叠全部
                </Button>
              </div>
            </div>
          </div>

          {/* Grouped Accordions list */}
          {loading ? (
            <div className="glass-card p-12 text-sm text-muted-foreground text-center">正在加载题目列表...</div>
          ) : error ? (
            <div className="glass-card p-12 text-sm text-destructive text-center border-destructive/20">{error}</div>
          ) : sortedGroupKeys.length === 0 ? (
            <div className="glass-card p-12 text-center text-sm text-muted-foreground">
              没有找到与搜索条件匹配的题目。
            </div>
          ) : (
            <Accordion type="multiple" value={openValues} onValueChange={setOpenValues} className="space-y-4">
              <AnimatePresence initial={false}>
                {sortedGroupKeys.map((groupKey) => {
                  const groupProblems = activeGroups[groupKey];
                  const acCount = groupProblems.filter((p) => p.user_status === 'AC').length;
                  const totalCount = groupProblems.length;
                  const progressPercent = totalCount > 0 ? (acCount / totalCount) * 100 : 0;

                  return (
                    <motion.div
                      key={groupKey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <AccordionItem
                        value={groupKey}
                        className="border border-white/[0.06] bg-white/[0.02] rounded-xl overflow-hidden shadow-sm transition hover:border-white/[0.1] hover:bg-white/[0.03]"
                      >
                        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-white/[0.01]">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full pr-2">
                            {/* Left side: Icon & Title info */}
                            <div className="flex items-center gap-3">
                              <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
                                {groupType === 'week' ? <FolderKanban className="size-4" /> : <TagIcon className="size-4" />}
                              </div>
                              <div className="text-left">
                                <h3 className="text-base font-semibold text-foreground tracking-tight">{groupKey}</h3>
                                <p className="text-xs text-muted-foreground">共 {totalCount} 道题目</p>
                              </div>
                            </div>

                            {/* Right side: Progress meter */}
                            <div className="flex items-center gap-4 sm:ml-auto">
                              <div className="flex flex-col items-end gap-1.5 min-w-[120px]">
                                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  已通过 <span className="font-mono text-foreground font-semibold">{acCount}</span> / {totalCount}
                                </span>
                                <div className="w-28 sm:w-36">
                                  <Progress value={progressPercent} className="h-1.5 bg-white/[0.04] [&>[data-slot=progress-indicator]]:bg-indigo-500" />
                                </div>
                              </div>
                              {progressPercent === 100 && totalCount > 0 && (
                                <div className="flex size-5 items-center justify-center rounded-full bg-status-ac/15 text-status-ac">
                                  <Check className="size-3" />
                                </div>
                              )}
                            </div>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-6 pb-6 pt-2 border-t border-white/[0.04] bg-black/[0.1]">
                          <ProblemTable problems={groupProblems} onSelect={(problemId) => navigate(`/problem/${problemId}`)} />
                        </AccordionContent>
                      </AccordionItem>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </Accordion>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  title,
  value,
  description,
  icon,
  spotlightColor,
  index = 0,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: ReactNode;
  spotlightColor?: string;
  index?: number;
}) {
  const isNumeric = typeof value === 'number';
  const countValue = useCountUp(isNumeric ? value : 0, 1600 + index * 200, isNumeric);
  const displayValue = isNumeric ? String(countValue) : String(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.6,
        delay: 0.15 + index * 0.12,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <SpotlightCard className="p-5 sm:p-6 group" spotlightColor={spotlightColor}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {title}
          </span>
          {icon}
        </div>
        {/* 数字弹出区域 — hover 时数字放大浮出 */}
        <div className="stat-number-wrap">
          <div className="text-2xl font-bold text-foreground tabular-nums tracking-tight stat-number">
            {displayValue}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </SpotlightCard>
    </motion.div>
  );
}
