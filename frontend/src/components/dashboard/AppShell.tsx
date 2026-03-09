import { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { RepoSelector } from '@/components/shared/RepoSelector';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  History,
  Link2,
  GitBranch,
  ClipboardList,
  Zap,
  Inbox,
  Settings,

  LogOut,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/executions', icon: History, label: 'Executions' },
  { to: '/connections', icon: Link2, label: 'Connections' },
  { to: '/repositories', icon: GitBranch, label: 'Repositories' },
  { to: '/manual-tasks', icon: ClipboardList, label: 'Manual Tasks' },
  { to: '/automation-rules', icon: Zap, label: 'Automation Rules' },
  { to: '/automation-inbox', icon: Inbox, label: 'Automation Inbox' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const themeOptions = [
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'system' as const, icon: Monitor, label: 'System' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auto-close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/20">
          <span className="text-sm font-bold text-white">A</span>
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">AI Automation</div>
          <div className="text-[10px] text-muted-foreground">Task Platform</div>
        </div>
      </div>

      {/* Repo selector */}
      <div className="px-3 pb-3">
        <RepoSelector className="w-full" />
      </div>

      <div className="mx-3 h-px bg-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2">
        {navItems.map((item) => {
          const isActive =
            item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-foreground/5 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

      </nav>

      {/* Theme toggle */}
      <div className="mx-3 flex items-center justify-center gap-1 py-2">
        {themeOptions.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              theme === opt.value
                ? 'bg-foreground/5 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground',
            )}
            aria-label={`Switch theme to ${opt.label}`}
            aria-pressed={theme === opt.value}
            title={opt.label}
          >
            <opt.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {/* User */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
            {user?.name?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{user?.name ?? 'User'}</div>
            <div className="truncate text-[10px] text-muted-foreground">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        id="mobile-sidebar-drawer"
        aria-hidden={!sidebarOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-border bg-background transition-transform duration-200 lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full invisible pointer-events-none',
        )}
      >
        {/* Close button */}
        <div className="flex justify-end p-2">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4 lg:hidden">
          <button
            type="button"
            aria-label="Open sidebar"
            aria-controls="mobile-sidebar-drawer"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">AI Automation</span>
        </div>

        {/* Page content */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
