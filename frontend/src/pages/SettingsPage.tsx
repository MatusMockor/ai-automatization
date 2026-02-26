import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Eye, EyeOff, Save, LogOut } from 'lucide-react';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // TODO: api.patch('/auth/profile', { name, email })
    await new Promise((r) => setTimeout(r, 500));
    toast.success('Profile updated');
    setSaving(false);
  };

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // TODO: api.patch('/settings', { claudeApiKey, githubToken })
    await new Promise((r) => setTimeout(r, 500));
    toast.success('API keys saved');
    setSaving(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and API credentials</p>
      </div>

      {/* Profile */}
      <form onSubmit={handleSaveProfile} className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            Save changes
          </button>
        </div>
      </form>

      {/* API Keys */}
      <form onSubmit={handleSaveKeys} className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">API Keys</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Keys are encrypted and stored securely. Required for Claude executions and GitHub access.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Claude API Key
            </label>
            <div className="relative">
              <input
                type={showClaudeKey ? 'text' : 'password'}
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="h-9 w-full rounded-lg border border-border bg-background px-3 pr-10 font-mono text-sm outline-none placeholder:font-sans focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => setShowClaudeKey(!showClaudeKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showClaudeKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              GitHub Personal Access Token
            </label>
            <div className="relative">
              <input
                type={showGithubToken ? 'text' : 'password'}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
                className="h-9 w-full rounded-lg border border-border bg-background px-3 pr-10 font-mono text-sm outline-none placeholder:font-sans focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => setShowGithubToken(!showGithubToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showGithubToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Needs <code className="rounded bg-foreground/5 px-1">repo</code> scope for cloning repositories
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            Save keys
          </button>
        </div>
      </form>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
        <h2 className="mb-1 text-sm font-semibold text-red-400">Danger Zone</h2>
        <p className="mb-4 text-xs text-muted-foreground">Sign out from your account</p>
        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
