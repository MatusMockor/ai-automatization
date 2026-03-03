import { useState } from 'react';
import { useRepo } from '@/context/RepoContext';
import { useTaskScopes } from '@/lib/useTaskScopes';
import { useRepositoryDefaults } from '@/lib/useRepositoryDefaults';
import { Loader2, X, Database } from 'lucide-react';
import type {
  TaskManagerProvider,
  RepositoryDefaultScopeType,
  TaskRepositoryDefaultItem,
  Repository,
} from '@/types';

function findDefault(
  defaults: TaskRepositoryDefaultItem[],
  provider: TaskManagerProvider,
  scopeType?: RepositoryDefaultScopeType,
  scopeId?: string,
): TaskRepositoryDefaultItem | undefined {
  return defaults.find(
    (d) =>
      d.provider === provider &&
      (d.scopeType ?? undefined) === scopeType &&
      (d.scopeId ?? undefined) === scopeId,
  );
}

interface DefaultRowProps {
  label: string;
  sublabel?: string;
  currentDefault: TaskRepositoryDefaultItem | undefined;
  repositories: Repository[];
  onSelect: (repoId: string) => void;
  onClear: () => void;
  saving: boolean;
}

function DefaultRow({ label, sublabel, currentDefault, repositories, onSelect, onClear, saving }: DefaultRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
      </div>
      <div className="flex items-center gap-1.5">
        <select
          aria-label={`${label} repository default`}
          value={currentDefault?.repositoryId ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            if (value) {
              onSelect(value);
            } else if (currentDefault) {
              onClear();
            }
          }}
          disabled={saving}
          className="h-8 max-w-[200px] truncate rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
        >
          <option value="">No default</option>
          {repositories.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.fullName}
            </option>
          ))}
        </select>
        {currentDefault && (
          <button
            type="button"
            onClick={onClear}
            disabled={saving}
            aria-label="Remove default"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

export function RepositoryDefaultsSection() {
  const { repositories } = useRepo();
  const { scopes } = useTaskScopes();
  const { defaults, loading, upsertDefault, deleteDefault } = useRepositoryDefaults();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading repository defaults...</span>
        </div>
      </div>
    );
  }

  const rowKey = (provider: TaskManagerProvider, scopeType?: string, scopeId?: string) =>
    `${provider}:${scopeType ?? ''}:${scopeId ?? ''}`;

  const handleSelect = async (
    provider: TaskManagerProvider,
    repoId: string,
    scopeType?: RepositoryDefaultScopeType,
    scopeId?: string,
  ) => {
    const key = rowKey(provider, scopeType, scopeId);
    setSavingKey(key);
    await upsertDefault({ provider, repositoryId: repoId, scopeType, scopeId });
    setSavingKey(null);
  };

  const handleClear = async (
    provider: TaskManagerProvider,
    scopeType?: RepositoryDefaultScopeType,
    scopeId?: string,
  ) => {
    const key = rowKey(provider, scopeType, scopeId);
    setSavingKey(key);
    await deleteDefault({ provider, scopeType, scopeId });
    setSavingKey(null);
  };

  const hasAsana = scopes && (scopes.asanaWorkspaces.length > 0 || scopes.asanaProjects.length > 0);
  const hasJira = scopes && scopes.jiraProjects.length > 0;
  const hasAsanaDefaults = defaults.some((d) => d.provider === 'asana');
  const hasJiraDefaults = defaults.some((d) => d.provider === 'jira');
  const showAsana = hasAsana || hasAsanaDefaults;
  const showJira = hasJira || hasJiraDefaults;

  // Find orphaned defaults (scope no longer returned by API)
  const knownScopeKeys = new Set<string>();
  scopes?.asanaWorkspaces.forEach((ws) => knownScopeKeys.add(`asana:asana_workspace:${ws.id}`));
  scopes?.asanaProjects.forEach((p) => knownScopeKeys.add(`asana:asana_project:${p.id}`));
  scopes?.jiraProjects.forEach((p) => knownScopeKeys.add(`jira:jira_project:${p.key}`));
  const orphanedDefaults = defaults.filter(
    (d) => d.scopeType && d.scopeId && !knownScopeKeys.has(`${d.provider}:${d.scopeType}:${d.scopeId}`),
  );
  const orphanedAsana = orphanedDefaults.filter((d) => d.provider === 'asana');
  const orphanedJira = orphanedDefaults.filter((d) => d.provider === 'jira');

  if (!showAsana && !showJira) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Repository Defaults</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Assign a default repository for tasks from each scope. More specific scopes (project) take priority over
        broader ones (workspace, provider).
      </p>

      {showAsana && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Asana</h3>

          <DefaultRow
            label="All Asana tasks"
            sublabel="Fallback for tasks without a more specific default"
            currentDefault={findDefault(defaults, 'asana')}
            repositories={repositories}
            onSelect={(repoId) => handleSelect('asana', repoId)}
            onClear={() => handleClear('asana')}
            saving={savingKey === rowKey('asana')}
          />

          {scopes?.asanaWorkspaces.map((ws) => (
            <DefaultRow
              key={ws.id}
              label={ws.name}
              sublabel={`Workspace \u00b7 ${ws.taskCount} task${ws.taskCount !== 1 ? 's' : ''}`}
              currentDefault={findDefault(defaults, 'asana', 'asana_workspace', ws.id)}
              repositories={repositories}
              onSelect={(repoId) => handleSelect('asana', repoId, 'asana_workspace', ws.id)}
              onClear={() => handleClear('asana', 'asana_workspace', ws.id)}
              saving={savingKey === rowKey('asana', 'asana_workspace', ws.id)}
            />
          ))}

          {scopes?.asanaProjects.map((proj) => (
            <DefaultRow
              key={proj.id}
              label={proj.name}
              sublabel={`Project in ${proj.workspaceName} \u00b7 ${proj.taskCount} task${proj.taskCount !== 1 ? 's' : ''}`}
              currentDefault={findDefault(defaults, 'asana', 'asana_project', proj.id)}
              repositories={repositories}
              onSelect={(repoId) => handleSelect('asana', repoId, 'asana_project', proj.id)}
              onClear={() => handleClear('asana', 'asana_project', proj.id)}
              saving={savingKey === rowKey('asana', 'asana_project', proj.id)}
            />
          ))}

          {orphanedAsana.map((d) => (
            <DefaultRow
              key={d.id}
              label={`${d.scopeId}`}
              sublabel={`Removed ${d.scopeType?.replace('asana_', '')} \u00b7 clear to remove`}
              currentDefault={d}
              repositories={repositories}
              onSelect={(repoId) => handleSelect('asana', repoId, d.scopeType!, d.scopeId!)}
              onClear={() => handleClear('asana', d.scopeType!, d.scopeId!)}
              saving={savingKey === rowKey('asana', d.scopeType!, d.scopeId!)}
            />
          ))}
        </div>
      )}

      {showJira && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jira</h3>

          <DefaultRow
            label="All Jira tasks"
            sublabel="Fallback for tasks without a more specific default"
            currentDefault={findDefault(defaults, 'jira')}
            repositories={repositories}
            onSelect={(repoId) => handleSelect('jira', repoId)}
            onClear={() => handleClear('jira')}
            saving={savingKey === rowKey('jira')}
          />

          {scopes?.jiraProjects.map((proj) => (
            <DefaultRow
              key={proj.key}
              label={proj.name}
              sublabel={`Project (${proj.key}) \u00b7 ${proj.taskCount} task${proj.taskCount !== 1 ? 's' : ''}`}
              currentDefault={findDefault(defaults, 'jira', 'jira_project', proj.key)}
              repositories={repositories}
              onSelect={(repoId) => handleSelect('jira', repoId, 'jira_project', proj.key)}
              onClear={() => handleClear('jira', 'jira_project', proj.key)}
              saving={savingKey === rowKey('jira', 'jira_project', proj.key)}
            />
          ))}

          {orphanedJira.map((d) => (
            <DefaultRow
              key={d.id}
              label={`${d.scopeId}`}
              sublabel="Removed project \u00b7 clear to remove"
              currentDefault={d}
              repositories={repositories}
              onSelect={(repoId) => handleSelect('jira', repoId, d.scopeType!, d.scopeId!)}
              onClear={() => handleClear('jira', d.scopeType!, d.scopeId!)}
              saving={savingKey === rowKey('jira', d.scopeType!, d.scopeId!)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
