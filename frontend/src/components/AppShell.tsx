import type { ReactNode } from 'react';
import Navbar from './Navbar';

interface AppShellProps {
  children: ReactNode;
  actions?: ReactNode;
}

export function AppShell({ children, actions }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      {actions && (
        <div className="mx-auto max-w-[1800px] px-4 sm:px-6 pt-4">
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
