import { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Repo {
  id: string;
  fullName: string;
  cloneUrl: string;
  localPath: string;
  isCloned: boolean;
  lastSynced?: string;
  branch: string;
}

export function RepositoriesPage() {
  const [repos, setRepos] = useState<Repo[]>([
    {
      id: '1',
      fullName: 'myapp/frontend',
      cloneUrl: 'https://github.com/myapp/frontend.git',
      localPath: '/repos/myapp/frontend',
      isCloned: true,
      lastSynced: '2 min ago',
      branch: 'main',
    },
    {
      id: '2',
      fullName: 'myapp/backend',
      cloneUrl: 'https://github.com/myapp/backend.git',
      localPath: '/repos/myapp/backend',
      isCloned: true,
      lastSynced: '1h ago',
      branch: 'main',
    },
  ]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim()) return;

    setAdding(true);
    // TODO: api.post('/repositories', { cloneUrl })
    await new Promise((r) => setTimeout(r, 1500));

    // Extract repo name from URL
    const match = cloneUrl.match(/([^/]+\/[^/]+?)(?:\.git)?$/);
    const fullName = match?.[1] ?? cloneUrl;

    const newRepo: Repo = {
      id: String(Date.now()),
      fullName,
      cloneUrl,
      localPath: `/repos/${fullName}`,
      isCloned: true,
      lastSynced: 'just now',
      branch: 'main',
    };

    setRepos((prev) => [...prev, newRepo]);
    setCloneUrl('');
    setShowAddForm(false);
    setAdding(false);
    toast.success(`Repository ${fullName} cloned`);
  };

  const handleSync = async (repoId: string) => {
    setSyncing(repoId);
    // TODO: api.post(`/repositories/${repoId}/sync`)
    await new Promise((r) => setTimeout(r, 1000));
    setRepos((prev) =>
      prev.map((r) => (r.id === repoId ? { ...r, lastSynced: 'just now' } : r)),
    );
    setSyncing(null);
    toast.success('Repository synced');
  };

  const handleRemove = (repoId: string) => {
    setRepos((prev) => prev.filter((r) => r.id !== repoId));
    toast.success('Repository removed');
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
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
              onClick={() => { setShowAddForm(false); setCloneUrl(''); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Git Clone URL
            </label>
            <input
              type="url"
              required
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git"
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

      {/* Repo list */}
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
                  <div className="font-mono">{repo.cloneUrl}</div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {repo.branch}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Synced {repo.lastSynced}
                    </span>
                    <span>Path: {repo.localPath}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSync(repo.id)}
                  disabled={syncing === repo.id}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                  title="Pull latest changes"
                >
                  <RefreshCw className={cn('h-4 w-4', syncing === repo.id && 'animate-spin')} />
                </button>
                <button
                  onClick={() => handleRemove(repo.id)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                  title="Remove repository"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {repos.length === 0 && !showAddForm && (
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
