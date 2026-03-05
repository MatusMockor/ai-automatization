import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { settingsSchema, type SettingsFormData } from '@/lib/schemas/settings';
import type { SettingsResponse, PreCommitChecksProfile } from '@/types';
import { PreCommitProfileEditor } from '@/components/shared/PreCommitProfileEditor';
import { toast } from 'sonner';
import { Eye, EyeOff, Save, LogOut } from 'lucide-react';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [maskedValues, setMaskedValues] = useState<SettingsResponse>({
    claudeOauthToken: null,
    githubToken: null,
    executionTimeoutMs: null,
    preCommitChecksDefault: null,
  });

  // Execution settings (controlled state, not react-hook-form)
  const [timeoutInput, setTimeoutInput] = useState('');
  const [profileDefault, setProfileDefault] = useState<PreCommitChecksProfile | null>(null);
  const [savingExecution, setSavingExecution] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormData>({ resolver: zodResolver(settingsSchema) });

  const fetchSettings = async () => {
    try {
      const { data } = await api.get<SettingsResponse>('/settings');
      setMaskedValues(data);
      setTimeoutInput(data.executionTimeoutMs != null ? String(data.executionTimeoutMs) : '');
      setProfileDefault(data.preCommitChecksDefault);
    } catch {
      // silently ignore — masked placeholders stay empty
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const onSaveKeys = async (data: SettingsFormData) => {
    // Only send fields the user actually filled in
    const payload: Record<string, string> = {};
    if (data.claudeOauthToken) payload.claudeOauthToken = data.claudeOauthToken;
    if (data.githubToken) payload.githubToken = data.githubToken;

    if (Object.keys(payload).length === 0) return;

    try {
      await api.patch('/settings', payload);
      toast.success('API keys saved');
      reset();
      await fetchSettings();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to save API keys';
      setError('root', { message });
    }
  };

  const onSaveExecution = async () => {
    setSavingExecution(true);
    try {
      const payload: Record<string, unknown> = {};
      const newTimeout = timeoutInput.trim() === '' ? null : Number(timeoutInput);
      if (newTimeout !== maskedValues.executionTimeoutMs) {
        payload.executionTimeoutMs = newTimeout;
      }
      if (JSON.stringify(profileDefault) !== JSON.stringify(maskedValues.preCommitChecksDefault)) {
        payload.preCommitChecksDefault = profileDefault;
      }

      if (Object.keys(payload).length === 0) {
        toast.info('No changes to save');
        return;
      }

      await api.patch('/settings', payload);
      toast.success('Execution settings saved');
      await fetchSettings();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to save execution settings';
      toast.error(message);
    } finally {
      setSavingExecution(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and API credentials</p>
      </div>

      {/* Profile */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Profile</h2>
        <div className="space-y-3">
          <div>
            <span className="block text-xs font-medium text-muted-foreground">Name</span>
            <span className="text-sm">{user?.name ?? '—'}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-muted-foreground">Email</span>
            <span className="text-sm">{user?.email ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <form onSubmit={handleSubmit(onSaveKeys)} className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">API Keys</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Keys are encrypted and stored securely. Required for Claude executions and GitHub access.
        </p>
        <div className="space-y-4">
          {errors.root && (
            <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-400 ring-1 ring-red-500/20">
              {errors.root.message}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Claude OAuth Token
            </label>
            <div className="relative">
              <input
                type={showClaudeKey ? 'text' : 'password'}
                {...register('claudeOauthToken')}
                placeholder={maskedValues.claudeOauthToken ?? 'oauth_...'}
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
                {...register('githubToken')}
                placeholder={maskedValues.githubToken ?? 'ghp_...'}
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
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            Save keys
          </button>
        </div>
      </form>

      {/* Execution Settings */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Execution Settings</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Configure execution timeout and default pre-commit check profile.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Execution Timeout (ms)
            </label>
            <input
              type="number"
              value={timeoutInput}
              onChange={(e) => setTimeoutInput(e.target.value)}
              min={60000}
              max={7200000}
              step={1000}
              placeholder="Leave empty for no limit"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none placeholder:font-sans focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Default Pre-Commit Checks
            </label>
            <PreCommitProfileEditor value={profileDefault} onChange={setProfileDefault} />
          </div>

          <button
            type="button"
            onClick={onSaveExecution}
            disabled={savingExecution}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {savingExecution ? 'Saving...' : 'Save execution settings'}
          </button>
        </div>
      </div>

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
