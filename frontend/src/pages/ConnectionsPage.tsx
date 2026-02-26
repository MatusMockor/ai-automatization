import { useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';

interface Connection {
  id: string;
  provider: 'jira' | 'asana';
  label: string;
  domain?: string;
  connected: boolean;
  lastSync?: string;
}

const providerInfo = {
  jira: {
    name: 'Jira',
    color: 'text-blue-400 bg-blue-500/10 ring-blue-500/20',
    icon: '🔵',
    fields: ['domain', 'email', 'apiToken'],
    placeholders: { domain: 'your-company.atlassian.net', email: 'you@company.com', apiToken: 'ATATT3...' },
  },
  asana: {
    name: 'Asana',
    color: 'text-rose-400 bg-rose-500/10 ring-rose-500/20',
    icon: '🟠',
    fields: ['personalAccessToken'],
    placeholders: { personalAccessToken: '1/12345678...' },
  },
};

export function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([
    { id: '1', provider: 'jira', label: 'Company Jira', domain: 'myapp.atlassian.net', connected: true, lastSync: '5 min ago' },
    { id: '2', provider: 'asana', label: 'Product Asana', connected: true, lastSync: '12 min ago' },
  ]);
  const [addingProvider, setAddingProvider] = useState<'jira' | 'asana' | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingProvider) return;
    setSaving(true);

    // TODO: api.post('/task-managers/connections', { provider: addingProvider, config: formData })
    await new Promise((r) => setTimeout(r, 800));

    const newConn: Connection = {
      id: String(Date.now()),
      provider: addingProvider,
      label: addingProvider === 'jira' ? `Jira (${formData.domain})` : 'Asana Workspace',
      domain: formData.domain,
      connected: true,
      lastSync: 'just now',
    };
    setConnections((prev) => [...prev, newConn]);
    setAddingProvider(null);
    setFormData({});
    setSaving(false);
    toast.success(`${providerInfo[addingProvider].name} connected`);
  };

  const handleRemove = (id: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
    toast.success('Connection removed');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your task managers to import tasks
        </p>
      </div>

      {/* Existing connections */}
      <div className="space-y-3">
        {connections.map((conn) => {
          const info = providerInfo[conn.provider];
          return (
            <div
              key={conn.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${info.color} ring-1`}>
                <span className="text-lg">{info.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{conn.label}</span>
                  {conn.connected ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {conn.domain && <span>{conn.domain} · </span>}
                  {conn.lastSync && <span>Last sync: {conn.lastSync}</span>}
                </div>
              </div>
              <button
                onClick={() => handleRemove(conn.id)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

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
              onClick={() => { setAddingProvider(null); setFormData({}); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            {providerInfo[addingProvider].fields.map((field) => {
              const isSecret = field.toLowerCase().includes('token') || field.toLowerCase().includes('secret');
              return (
                <div key={field}>
                  <label className="mb-1.5 block text-xs font-medium capitalize text-muted-foreground">
                    {field.replace(/([A-Z])/g, ' $1').trim()}
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
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Connect
            </button>
          </div>
        </form>
      )}

      {/* Prefixes config hint */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <h3 className="mb-1 text-xs font-semibold text-muted-foreground">Task Prefixes</h3>
        <p className="text-xs text-muted-foreground">
          After connecting, tasks with titles starting with <code className="rounded bg-foreground/5 px-1">fix:</code>,{' '}
          <code className="rounded bg-foreground/5 px-1">feature:</code>,{' '}
          <code className="rounded bg-foreground/5 px-1">chore:</code>,{' '}
          <code className="rounded bg-foreground/5 px-1">plan:</code> will be automatically categorized in the dashboard.
        </p>
      </div>
    </div>
  );
}
