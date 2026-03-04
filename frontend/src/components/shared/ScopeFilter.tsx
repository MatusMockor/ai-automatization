import type { TaskScopesResponse } from '@/types';

interface ScopeFilterProps {
  scopes: TaskScopesResponse;
  selectedWorkspaceId: string | null;
  selectedProjectId: string | null;
  selectedProjectKey: string | null;
  onWorkspaceChange: (id: string | null) => void;
  onProjectIdChange: (id: string | null) => void;
  onProjectChange: (key: string | null) => void;
  disabled?: boolean;
}

const selectClassName =
  'h-8 max-w-[180px] truncate rounded-lg bg-foreground/5 px-2.5 text-sm outline-none ring-1 ring-transparent transition-all focus:bg-foreground/8 focus:ring-ring/30 disabled:opacity-50';

export function ScopeFilter({
  scopes,
  selectedWorkspaceId,
  selectedProjectId,
  selectedProjectKey,
  onWorkspaceChange,
  onProjectIdChange,
  onProjectChange,
  disabled,
}: ScopeFilterProps) {
  const hasWorkspaces = scopes.asanaWorkspaces.length > 0;
  const hasAsanaProjects = scopes.asanaProjects.length > 0;
  const hasProjects = scopes.jiraProjects.length > 0;

  if (!hasWorkspaces && !hasAsanaProjects && !hasProjects) return null;

  return (
    <div className="flex items-center gap-2">
      {hasWorkspaces && (
        <select
          aria-label="Filter by Asana workspace"
          value={selectedWorkspaceId ?? ''}
          onChange={(e) => onWorkspaceChange(e.target.value || null)}
          disabled={disabled}
          className={selectClassName}
        >
          <option value="">All workspaces</option>
          {scopes.asanaWorkspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name} ({ws.taskCount})
            </option>
          ))}
        </select>
      )}
      {hasAsanaProjects && (
        <select
          aria-label="Filter by Asana project"
          value={selectedProjectId ?? ''}
          onChange={(e) => onProjectIdChange(e.target.value || null)}
          disabled={disabled}
          className={selectClassName}
        >
          <option value="">All Asana projects</option>
          {scopes.asanaProjects.map((proj) => (
            <option key={proj.id} value={proj.id}>
              {proj.name} ({proj.workspaceName}) ({proj.taskCount})
            </option>
          ))}
        </select>
      )}
      {hasProjects && (
        <select
          aria-label="Filter by Jira project"
          value={selectedProjectKey ?? ''}
          onChange={(e) => onProjectChange(e.target.value || null)}
          disabled={disabled}
          className={selectClassName}
        >
          <option value="">All projects</option>
          {scopes.jiraProjects.map((proj) => (
            <option key={proj.key} value={proj.key}>
              {proj.name} ({proj.taskCount})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
