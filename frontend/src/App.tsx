import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { RepoProvider } from '@/context/RepoContext';
import { AppShell } from '@/components/dashboard/AppShell';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ConnectionsPage } from '@/pages/ConnectionsPage';
import { RepositoriesPage } from '@/pages/RepositoriesPage';
import { ExecutionsPage } from '@/pages/ExecutionsPage';
import { VariantSelector } from '@/components/dashboard/VariantSelector';
import { CommandCenter } from '@/components/dashboard/CommandCenter';
import { KanbanBoard } from '@/components/dashboard/KanbanBoard';
import { TerminalFirst } from '@/components/dashboard/TerminalFirst';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { FocusMode } from '@/components/dashboard/FocusMode';
import { ArrowLeft } from 'lucide-react';

function BackButton() {
  return (
    <Link
      to="/"
      className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
    >
      <ArrowLeft className="h-3 w-3" />
      Back
    </Link>
  );
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          color: 'hsl(var(--foreground))',
        },
      }}
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              <Route
                element={
                  <ProtectedRoute>
                    <RepoProvider>
                      <ErrorBoundary>
                        <AppShell />
                      </ErrorBoundary>
                    </RepoProvider>
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="executions" element={<ExecutionsPage />} />
                <Route path="connections" element={<ConnectionsPage />} />
                <Route path="repositories" element={<RepositoriesPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="variants" element={<VariantSelector />} />
              </Route>

              <Route path="/v1" element={<><BackButton /><CommandCenter /></>} />
              <Route path="/v2" element={<><BackButton /><KanbanBoard /></>} />
              <Route path="/v3" element={<><BackButton /><TerminalFirst /></>} />
              <Route path="/v4" element={<><BackButton /><DashboardOverview /></>} />
              <Route path="/v5" element={<><BackButton /><FocusMode /></>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <ThemedToaster />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
