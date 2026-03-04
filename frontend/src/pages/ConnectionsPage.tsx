import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  X,
  Link2,
  Clock,
  Loader2,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useTick } from '@/lib/useTick';
import { RepositoryDefaultsSection } from '@/components/connections/RepositoryDefaultsSection';
import type { TaskManagerConnection, TaskManagerProvider } from '@/types';

const providerInfo = {
  jira: {
    name: 'Jira',
    color: 'text-blue-400 bg-blue-500/10 ring-blue-500/20',
    icon: '🔵',
    fields: ['baseUrl', 'email', 'apiToken'],
    labels: { baseUrl: 'Base URL', email: 'Email', apiToken: 'API Token' } as Record<string, string>,
    placeholders: { baseUrl: 'https://your-company.atlassian.net', email: 'you@company.com', apiToken: 'ATATT3...' },
  },
  asana: {
    name: 'Asana',
    color: 'text-rose-400 bg-rose-500/10 ring-rose-500/20',
    icon: '🟠',
    fields: ['personalAccessToken'],
    labels: { personalAccessToken: 'Personal Access Token' } as Record<string, string>,
    placeholders: { personalAccessToken: '1/12345678...' },
  },
};

export function ConnectionsPage() {
  useTick();
  const [connections, setConnections] = useState<TaskManagerConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState<TaskManagerProvider | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingInFlight, setDeletingInFlight] = useState(false);
  const fetchConnections = async () => {
    try {
      const { data } = await api.get<TaskManagerConnection[]>('/task-managers/connections');
      setConnections(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load connections'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingProvider || saving) return;
    setSaving(true);

    try {
      let body: Record<string, string>;
      if (addingProvider === 'jira') {
        body = {
          provider: 'jira',
          authMode: 'basic',
          baseUrl: formData.baseUrl,
          email: formData.email,
          apiToken: formData.apiToken,
        };
      } else {
        body = {
          provider: 'asana',
          personalAccessToken: formData.personalAccessToken,
        };
      }

      const { data } = await api.post<TaskManagerConnection>('/task-managers/connections', body);
      setConnections((prev) => [data, ...prev]);
      setAddingProvider(null);
      setFormData({});
      setShowSecrets({});
      toast.success(`${providerInfo[addingProvider].name} connected`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to connect'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingInFlight) return;
    setDeletingInFlight(true);
    try {
      await api.delete(`/task-managers/connections/${id}`);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      setDeleting(null);
      toast.success('Connection removed');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to remove connection'));
      setDeleting(null);
    } finally {
      setDeletingInFlight(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your task managers to import tasks
        </p>
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">Loading connections...</span>
        </div>
      )}

      {/* Existing connections */}
      {!loading && (
        <div className="space-y-3">
          {connections.map((conn) => {
            const info = providerInfo[conn.provider];
            return (
              <div
                key={conn.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${info.color} ring-1`}>
                    <span className="text-lg">{info.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{conn.name ?? info.name}</span>
                      {conn.status === 'connected' ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                      ) : conn.status === 'pending' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {conn.baseUrl && <span>{conn.baseUrl} · </span>}
                      {conn.lastValidatedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Validated {timeAgo(conn.lastValidatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {deleting === conn.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(conn.id)}
                          disabled={deletingInFlight}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {deletingInFlight ? 'Removing...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeleting(null)}
                          type="button"
                          disabled={deletingInFlight}
                          aria-label="Cancel connection removal"
                          title="Cancel"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={deletingInFlight}
                        onClick={() => setDeleting(conn.id)}
                        aria-label={`Remove ${conn.name ?? info.name} connection`}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                        title="Remove connection"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && connections.length === 0 && !addingProvider && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Link2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No connections yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Connect a task manager to start importing tasks
          </p>
        </div>
      )}

      {/* Add connection */}
      {!addingProvider ? (
        <div className="flex gap-3">
          <button
            onClick={() => setAddingProvider('jira')}
            className="flex flex-1 items-center gap-3 rounded-xl border border-dashed border-border p-4 transition-colors hover:border-blue-500/30 hover:bg-blue-500/5"
          >
            <span className="text-xl">🔵</span>
            <div className="text-left">
              <div className="text-sm font-medium">Connect Jira</div>
              <div className="text-xs text-muted-foreground">Import tasks from Jira Cloud</div>
            </div>
            <Plus className="ml-auto h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setAddingProvider('asana')}
            className="flex flex-1 items-center gap-3 rounded-xl border border-dashed border-border p-4 transition-colors hover:border-rose-500/30 hover:bg-rose-500/5"
          >
            <span className="text-xl">🟠</span>
            <div className="text-left">
              <div className="text-sm font-medium">Connect Asana</div>
              <div className="text-xs text-muted-foreground">Import tasks from Asana</div>
            </div>
            <Plus className="ml-auto h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Connect {providerInfo[addingProvider].name}
            </h2>
            <button
              type="button"
              disabled={saving}
              onClick={() => { setAddingProvider(null); setFormData({}); setShowSecrets({}); }}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            {providerInfo[addingProvider].fields.map((field) => {
              const isSecret = field.toLowerCase().includes('token') || field.toLowerCase().includes('secret');
              return (
                <div key={field}>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    {providerInfo[addingProvider].labels[field] ?? field}
                  </label>
                  <div className="relative">
                    <input
                      type={isSecret && !showSecrets[field] ? 'password' : 'text'}
                      required
                      value={formData[field] ?? ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
                      placeholder={providerInfo[addingProvider].placeholders[field as keyof typeof providerInfo.jira.placeholders] ?? ''}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 pr-10 font-mono text-sm outline-none placeholder:font-sans focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                    />
                    {isSecret && (
                      <button
                        type="button"
                        onClick={() => setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }))}
                        aria-label={showSecrets[field] ? `Hide ${providerInfo[addingProvider].labels[field] ?? field}` : `Show ${providerInfo[addingProvider].labels[field] ?? field}`}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecrets[field] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Connect
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Repository Defaults */}
      {!loading && <RepositoryDefaultsSection />}
    </div>
  );
}
