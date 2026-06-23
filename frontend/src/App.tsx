import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminProblemEditorPage from './pages/admin/AdminProblemEditorPage';
import DashboardPage from './pages/DashboardPage';
import ExamCreatePage from './pages/Exam/ExamCreatePage';
import ExamPage from './pages/Exam/ExamPage';
import ExamResultsPage from './pages/Exam/ExamResultsPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import ProblemWorkspacePage from './pages/ProblemWorkspacePage';
import { useAuthStore } from './store/authStore';

const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.22, ease: 'easeOut' as const },
};

function PageShell({ children }: { children: ReactNode }) {
  return <motion.div {...pageTransition}>{children}</motion.div>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated || !user?.is_admin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageShell><DashboardPage /></PageShell>} />
        <Route path="/login" element={<PageShell><LoginPage /></PageShell>} />
        <Route path="/profile" element={<PageShell><ProfilePage /></PageShell>} />
        <Route path="/problem/:id" element={<PageShell><ProblemWorkspacePage /></PageShell>} />
        <Route path="/exam/create" element={<ProtectedRoute><PageShell><ExamCreatePage /></PageShell></ProtectedRoute>} />
        <Route path="/exam/:examId" element={<ProtectedRoute><PageShell><ExamPage /></PageShell></ProtectedRoute>} />
        <Route path="/exam/:examId/results" element={<ProtectedRoute><PageShell><ExamResultsPage /></PageShell></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><PageShell><AdminDashboardPage /></PageShell></AdminRoute>} />
        <Route path="/admin/problems/new" element={<AdminRoute><PageShell><AdminProblemEditorPage /></PageShell></AdminRoute>} />
        <Route path="/admin/problems/:id" element={<AdminRoute><PageShell><AdminProblemEditorPage /></PageShell></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}
