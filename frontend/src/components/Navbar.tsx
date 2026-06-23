import { Code2, LogOut, BarChart3, Shield, Home, PenTool } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { motion } from 'framer-motion';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { to: '/', label: '题目大厅', icon: Home },
    { to: '/profile', label: '个人主页', icon: BarChart3 },
    ...(isAuthenticated ? [{ to: '/exam/create', label: '考试', icon: PenTool }] : []),
    ...(user?.is_admin ? [{ to: '/admin', label: '后台管理', icon: Shield }] : []),
  ];

  return (
    <nav className="border-b border-white/[0.06] bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 font-semibold group">
              <div className="size-8 rounded-lg bg-foreground flex items-center justify-center">
                <Code2 className="size-4 text-background" />
              </div>
              <span className="font-bold text-lg tracking-tight">Mak&apos;s OJ</span>
            </Link>

            <div className="flex items-center gap-1">
              {navLinks.map(({ to, label, icon: Icon }) => {
                const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'text-primary bg-primary/[0.08]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                    {isActive && (
                      <motion.div
                        layoutId="navbar-indicator"
                        className="absolute inset-0 rounded-lg bg-primary/[0.08]"
                        style={{ zIndex: -1 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 hover:bg-white/[0.06]">
                    <div className="size-5 rounded-full bg-foreground flex items-center justify-center text-[10px] font-bold text-background">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    {user.username}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-popover/95 backdrop-blur-xl border-white/[0.08]">
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <BarChart3 className="size-4 mr-2" />
                    个人主页
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/exam/create')}>
                    <PenTool className="size-4 mr-2" />
                    考试
                  </DropdownMenuItem>
                  {user.is_admin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate('/admin')}>
                        <Shield className="size-4 mr-2" />
                        后台管理
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    <LogOut className="size-4 mr-2" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                size="sm"
                onClick={() => navigate('/login')}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                登录
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
