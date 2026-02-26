import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  GitBranch,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  FolderGit2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import type { Repository } from '@/types';

const getApiErrorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function RepositoriesPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingInFlight, setDeletingInFlight] = useState(false);

  const fetchRepos = async () => {
    try {
      const { data } = await api.get<Repository[]>('/repositories');
      setRepos(data);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to load repositories'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !fullName.trim()) return;

    setAdding(true);
    try {
      const { data } = await api.post<Repository>('/repositories', { fullName });
      setRepos((prev) => [data, ...prev]);
      setFullName('');
      setShowAddForm(false);
      toast.success(`Repository ${data.fullName} cloned`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to add repository'));
    } finally {
      setAdding(false);
    }
  };

  const handleSync = async (repoId: string) => {
    if (syncingIds.has(repoId)) return;
    setSyncingIds((prev) => new Set(prev).add(repoId));
    try {
      const { data } = await api.post<Repository>(`/repositories/${repoId}/sync`);
      setRepos((prev) => prev.map((r) => (r.id === repoId ? data : r)));
      toast.success('Repository synced');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to sync repository'));
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(repoId);
        return next;
      });
    }
  };

  const handleDelete = async (repoId: string) => {
    if (deletingInFlight) return;
    setDeletingInFlight(true);
    try {
      await api.delete(`/repositories/${repoId}`);
      setRepos((prev) => prev.filter((r) => r.id !== repoId));
      setDeleting(null);
      toast.success('Repository removed');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to remove repository'));
      setDeleting(null);
    } finally {
      setDeletingInFlight(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Repositories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage git repositories for Claude Code executions
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add repository
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Clone Repository</h2>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setFullName(''); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Repository
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              pattern="^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$"
              placeholder="owner/repo"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none placeholder:font-sans focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Private repos require a GitHub token configured in Settings.
              The repo will be cloned to the server and used for Claude Code executions.
            </p>
          </div>

          <button
            type="submit"
            disabled={adding}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Cloning...
              </>
            ) : (
              <>
                <FolderGit2 className="h-3.5 w-3.5" />
                Clone repository
              </>
            )}
          </button>
        </form>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">Loading repositories...</span>
        </div>
      )}

      {/* Repo list */}
      {!loading && (
        <div className="space-y-3">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/5 ring-1 ring-foreground/10">
                  <GitBranch className="h-5 w-5 text-muted-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{repo.fullName}</span>
                    {repo.isCloned ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {repo.defaultBranch}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Synced {timeAgo(repo.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSync(repo.id)}
                    disabled={syncingIds.has(repo.id)}
                    aria-label={`Sync ${repo.fullName}`}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                    title="Pull latest changes"
                  >
                    <RefreshCw className={cn('h-4 w-4', syncingIds.has(repo.id) && 'animate-spin')} />
                  </button>
                  {deleting === repo.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(repo.id)}
                        disabled={deletingInFlight}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {deletingInFlight ? 'Removing...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setDeleting(null)}
                        type="button"
                        aria-label="Cancel repository removal"
                        title="Cancel"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleting(repo.id)}
                      aria-label={`Remove ${repo.fullName}`}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                      title="Remove repository"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && repos.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <FolderGit2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No repositories yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Add a git repository to start running Claude Code on your tasks
          </p>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <h3 className="mb-1 text-xs font-semibold text-muted-foreground">How it works</h3>
        <p className="text-xs text-muted-foreground">
          When you run a Claude Code action (Fix, Feature, Plan) on a task, it will execute
          against the currently active repository. You can switch the active repo from the
          dashboard sidebar. Claude will read the codebase, make changes, and create a PR.
        </p>
      </div>
    </div>
  );
}
