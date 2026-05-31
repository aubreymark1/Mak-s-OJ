import { Activity, BarChart3, CheckCircle, Mail, RefreshCcw, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { UserStatsResponse } from '../types/oj';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadUserStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<UserStatsResponse>(`/users/${user.id}/stats`);
      setStats(data);
    } catch {
      setError('统计数据加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }
    void loadUserStats();
  }, [isAuthenticated, user, loadUserStats]);

  const acRateDisplay = stats ? `${(stats.ac_rate * 100).toFixed(1)}%` : '--';

  if (!isAuthenticated || !user) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-5xl px-4 sm:px-6 py-12">
          <Card className="w-full">
            <CardContent className="pt-6 text-center">
              <h2 className="text-2xl font-semibold">个人主页</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                登录后即可查看你的基础资料与做题统计。
              </p>
              <Button onClick={() => navigate('/login')} className="mt-6">
                前往登录
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">个人主页</h2>
          <Button variant="outline" size="sm" onClick={() => void loadUserStats()} disabled={loading}>
            <RefreshCcw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            刷新统计
          </Button>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}

        <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <ProfileStatCard
            title="用户名"
            value={user.username}
            description="当前登录账号"
            icon={<UserRound className="size-4 text-muted-foreground" />}
          />
          <ProfileStatCard
            title="邮箱"
            value={user.email}
            description="账户绑定邮箱"
            icon={<Mail className="size-4 text-muted-foreground" />}
          />
          <ProfileStatCard
            title="总提交数"
            value={String(stats?.total_submissions ?? 0)}
            description={`已通过 ${stats?.ac_count ?? 0} 次`}
            icon={<Activity className="size-4 text-muted-foreground" />}
          />
          <ProfileStatCard
            title="通过率"
            value={acRateDisplay}
            description={`已尝试 ${stats?.attempted_problems ?? 0} 题 / 已通过 ${stats?.ac_problems ?? 0} 题`}
            icon={<CheckCircle className="size-4 text-muted-foreground" />}
          />
        </section>

        <section className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <BarChart3 className="size-5 text-muted-foreground" />
                <CardTitle>做题统计</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-3">
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold text-primary">{stats?.attempted_problems ?? 0}</div>
                  <div className="mt-1 text-sm text-muted-foreground">已尝试题目</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold" style={{ color: 'var(--status-ac)' }}>{stats?.ac_problems ?? 0}</div>
                  <div className="mt-1 text-sm text-muted-foreground">已通过题目</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold" style={{ color: 'var(--status-wa)' }}>{stats?.total_submissions ?? 0}</div>
                  <div className="mt-1 text-sm text-muted-foreground">总提交次数</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

function ProfileStatCard({
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
        <div className="break-all text-2xl font-semibold">{value}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
