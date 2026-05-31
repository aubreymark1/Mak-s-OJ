import type { AxiosError } from 'axios';
import { Code2, LoaderCircle, ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { useAuthStore } from '../store/authStore';

type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isLoading } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        await login({ username, password });
      } else {
        await register({ username, password, email, full_name: fullName || undefined });
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(resolveAuthError(err, mode));
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12 text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-5" style={{ background: 'radial-gradient(circle at top, color-mix(in srgb, var(--primary) 10%, transparent), transparent 35%)' }} />

      <div className="relative w-full max-w-xl rounded-xl border bg-card p-8 shadow-lg">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Code2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-[var(--font-display)]">Mak&apos;s OJ 登录</h1>
            <p className="text-sm text-muted-foreground">登录后即可提交评测、查看个人学情。</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              mode === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              mode === 'register' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm text-muted-foreground">用户名</label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-md border bg-input-background px-3 py-2 text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="请输入用户名"
              required
            />
          </div>

          {mode === 'register' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm text-muted-foreground">邮箱</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-md border bg-input-background px-3 py-2 text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  placeholder="例如：you@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="fullName" className="text-sm text-muted-foreground">昵称（可选）</label>
                <input
                  id="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-md border bg-input-background px-3 py-2 text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  placeholder="你希望展示在系统中的名字"
                />
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm text-muted-foreground">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border bg-input-background px-3 py-2 text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder={mode === 'login' ? '请输入密码' : '至少 6 位'}
              required
            />
          </div>

          {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : mode === 'login' ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {isLoading ? (mode === 'login' ? '登录中...' : '注册中...') : mode === 'login' ? '登录' : '注册并进入系统'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          返回 <Link to="/" className="text-primary hover:underline">题目大厅</Link>
        </p>
      </div>
    </div>
  );
}

function resolveAuthError(error: unknown, mode: AuthMode) {
  const axiosError = error as AxiosError<{ detail?: string | { msg?: string }[] }>;
  if (!axiosError.response) {
    return '无法连接后端接口，请确认前端代理与后端服务均已启动。';
  }

  if (axiosError.response.status === 401) {
    return '用户名或密码不正确。';
  }

  if (axiosError.response.status === 409) {
    return '该用户名或邮箱已被占用，请更换后再试。';
  }

  if (axiosError.response.status === 422) {
    const detail = axiosError.response.data?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail[0]?.msg) {
      return detail[0].msg;
    }
    return mode === 'login' ? '登录参数校验失败，请检查输入格式。' : '注册参数校验失败，请检查输入内容。';
  }

  if (typeof axiosError.response.data?.detail === 'string') {
    return axiosError.response.data.detail;
  }

  return mode === 'login' ? '登录失败，请稍后重试。' : '注册失败，请稍后重试。';
}
