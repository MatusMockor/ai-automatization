import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { ManualTasksPage } from '@/pages/ManualTasksPage';
import { AutomationRulesPage } from '@/pages/AutomationRulesPage';
import { AutomationInboxPage } from '@/pages/AutomationInboxPage';

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
                <Route path="manual-tasks" element={<ManualTasksPage />} />
                <Route path="automation-rules" element={<AutomationRulesPage />} />
                <Route path="automation-inbox" element={<AutomationInboxPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

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
