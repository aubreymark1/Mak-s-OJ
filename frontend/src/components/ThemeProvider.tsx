import { useEffect, type ReactNode } from 'react';

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add('dark');
    localStorage.setItem('vite-ui-theme', 'dark');
  }, []);

  return <>{children}</>;
}
