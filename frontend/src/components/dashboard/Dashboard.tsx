import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTick } from '@/lib/useTick';
import { useSyncRun } from '@/lib/useSyncRun';
import { useTaskScopes } from '@/lib/useTaskScopes';
import { StatsBar } from './StatsBar';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';
import { ActivityPanel } from './ActivityPanel';
import { TerminalPanel } from './TerminalPanel';
import { SyncBanner } from './SyncBanner';
import { SyncButton } from '@/components/shared/SyncButton';
import { ScopeFilter } from '@/components/shared/ScopeFilter';
import { api, getApiErrorMessage } from '@/lib/api';
import { useRepo } from '@/context/RepoContext';
import { useExecutionStream } from '@/lib/useExecutionStream';
import { toast } from 'sonner';
import type { TaskFeedItem, TaskFeedConnectionError, TaskFeedResponse, ExecutionAction, Execution, CreateExecutionRequest, TaskManagerProvider, TaskManagerConnection, ReviewGateStatus } from '@/types';
import { Search, AlertTriangle } from 'lucide-react';

const createIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `dashboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function Dashboard() {
  useTick();
  const { selectedRepo, repositories } = useRepo();

  const [selectedTask, setSelectedTask] = useState<TaskFeedItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskFeedItem[]>([]);
  const [feedErrors, setFeedErrors] = useState<TaskFeedConnectionError[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [executions, setExecutions] = useState<Execution[]>([]);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [publishPullRequest, setPublishPullRequest] = useState(true);
  const [requireCodeChanges, setRequireCodeChanges] = useState(true);
  const [executionRepoId, setExecutionRepoId] = useState<string | null>(null);
  const latestTasksRequestRef = useRef(0);

  // Scopes + sync
  const { scopes, refreshScopes } = useTaskScopes();

  // Connections — used as provider fallback when scopes are empty (pre-first-sync)
  const [connections, setConnections] = useState<TaskManagerConnection[]>([]);
  useEffect(() => {
    api.get<TaskManagerConnection[]>('/task-managers/connections')
      .then(({ data }) => setConnections(data))
      .catch(() => {});
  }, []);

  const connectionProvider = useMemo<TaskManagerProvider | null>(() => {
    const connected = connections.filter((c) => c.status === 'connected');
    if (connected.some((c) => c.provider === 'asana')) return 'asana';
    if (connected.some((c) => c.provider === 'jira')) return 'jira';
    return null;
  }, [connections]);

  // Provider derivation
  const defaultProvider = useMemo(() => {
    if (!scopes) return connectionProvider;
    const hasAsana = scopes.asanaWorkspaces.length > 0 || scopes.asanaProjects.length > 0;
    if (hasAsana) return 'asana' as TaskManagerProvider;
    if (scopes.jiraProjects.length > 0) return 'jira' as TaskManagerProvider;
    return connectionProvider;
  }, [scopes, connectionProvider]);

  const availableProviders = useMemo<TaskManagerProvider[]>(() => {
    const set = new Set<TaskManagerProvider>();
    if (scopes) {
      if (scopes.asanaWorkspaces.length > 0 || scopes.asanaProjects.length > 0) set.add('asana');
      if (scopes.jiraProjects.length > 0) set.add('jira');
    }
    for (const c of connections) {
      if (c.status === 'connected') set.add(c.provider);
    }
    return Array.from(set);
  }, [scopes, connections]);

  const [selectedProvider, setSelectedProvider] = useState<TaskManagerProvider | null>(null);
  const provider = selectedProvider ?? defaultProvider;

  // Reconcile selectedProvider when available providers change (e.g. after sync removes a provider)
  useEffect(() => {
    if (!selectedProvider || availableProviders.length === 0) return;
    if (!availableProviders.includes(selectedProvider)) {
      setSelectedProvider(availableProviders[0] ?? null);
    }
  }, [availableProviders, selectedProvider]);

  // Reset scope filters when provider changes
  const prevProviderRef = useRef<TaskManagerProvider | null>(null);
  useEffect(() => {
    if (prevProviderRef.current !== null && provider !== prevProviderRef.current) {
      setSelectedWorkspaceId(null);
      setSelectedProjectId(null);
      setSelectedProjectKey(null);
      setSelectedTask(null);
    }
    prevProviderRef.current = provider;
  }, [provider]);

  // Fetch tasks (re-runs when scope filters or provider change)
  const fetchTasks = useCallback(async () => {
    const requestId = ++latestTasksRequestRef.current;
    setLoading(true);
    try {
      setLoadError(null);
      const params: Record<string, string> = {};
      if (provider) params.provider = provider;
      if (provider === 'asana') {
        if (selectedWorkspaceId) params.asanaWorkspaceId = selectedWorkspaceId;
        if (selectedProjectId) params.asanaProjectId = selectedProjectId;
      } else if (provider === 'jira') {
        if (selectedProjectKey) params.jiraProjectKey = selectedProjectKey;
      } else {
        if (selectedWorkspaceId) params.asanaWorkspaceId = selectedWorkspaceId;
        if (selectedProjectId) params.asanaProjectId = selectedProjectId;
        if (selectedProjectKey) params.jiraProjectKey = selectedProjectKey;
      }
      const { data } = await api.get<TaskFeedResponse>('/tasks', { params });
      if (requestId !== latestTasksRequestRef.current) return;
      setTasks(data.items);
      setFeedErrors(data.errors);
    } catch (err) {
      if (requestId !== latestTasksRequestRef.current) return;
      const message = getApiErrorMessage(err, 'Failed to load tasks');
      setLoadError(message);
      setTasks([]);
      setFeedErrors([]);
      toast.error(message);
    } finally {
      if (requestId === latestTasksRequestRef.current) setLoading(false);
    }
  }, [provider, selectedWorkspaceId, selectedProjectId, selectedProjectKey]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSyncComplete = useCallback(async () => {
    await Promise.all([fetchTasks(), refreshScopes()]);
  }, [fetchTasks, refreshScopes]);

  const { syncState, progress, triggerSync } = useSyncRun({ onComplete: handleSyncComplete });

  const handleSync = useCallback(() => {
    if (provider) triggerSync(provider);
  }, [provider, triggerSync]);

  useEffect(() => {
    setPublishPullRequest(true);
    setRequireCodeChanges(true);
    setExecutionRepoId(selectedTask?.suggestedRepositoryId ?? null);
  }, [selectedTask?.id, selectedTask?.suggestedRepositoryId]);

  // Fetch executions
  useEffect(() => {
    const fetchExecutions = async () => {
      try {
        const { data } = await api.get<Execution[]>('/executions', { params: { limit: 50 } });
        setExecutions(data);
      } catch {
        // Non-critical — executions list just stays empty
      }
    };
    fetchExecutions();
  }, []);

  // SSE stream
  const handleStreamEvent = useCallback((event: import('@/types').ExecutionStreamEvent) => {
    if (event.type === 'status' || event.type === 'completed' || event.type === 'error') {
      setExecutions((prev) =>
        prev.map((e) =>
          e.id === event.executionId
            ? {
                ...e,
                status: event.status,
                errorMessage: event.errorMessage ?? e.errorMessage,
                ...(event.status === 'pending' ? { output: '', errorMessage: null, automationStatus: 'pending' as const, automationErrorMessage: null } : {}),
              }
            : e,
        ),
      );
    }
    if (event.type === 'review') {
      const reviewUpdate = {
        reviewGateStatus: event.reviewGateStatus as ReviewGateStatus,
        reviewPendingDecisionUntil: event.pendingDecisionUntil ?? null,
      };
      setExecutions((prev) =>
        prev.map((e) => (e.id === event.executionId ? { ...e, ...reviewUpdate } : e)),
      );
    }
    if (event.type === 'publication') {
      setExecutions((prev) =>
        prev.map((e) =>
          e.id === event.executionId
            ? {
                ...e,
                automationStatus: event.automationStatus,
                pullRequestUrl: event.pullRequestUrl ?? e.pullRequestUrl,
                automationErrorMessage:
                  event.automationStatus === 'failed' || event.automationStatus === 'no_changes'
                    ? (event.message ?? e.automationErrorMessage)
                    : null,
              }
            : e,
        ),
      );
    }
  }, []);

  const { output: streamOutput, status: streamStatus, errorMessage: streamErrorMessage, automationStatus: streamAutomationStatus } = useExecutionStream({
    executionId: activeExecutionId,
    onEvent: handleStreamEvent,
  });

  // Build active execution for TerminalPanel by merging stream data
  const activeExecution = useMemo(() => {
    if (!activeExecutionId) return undefined;
    const base = executions.find((e) => e.id === activeExecutionId);
    if (!base) return undefined;
    return {
      ...base,
      output: streamOutput || base.output,
      status: streamStatus ?? base.status,
      errorMessage: streamErrorMessage ?? base.errorMessage,
      automationStatus: streamAutomationStatus ?? base.automationStatus,
    };
  }, [activeExecutionId, executions, streamOutput, streamStatus, streamErrorMessage, streamAutomationStatus]);

  const runningCount = executions.filter((e) => e.status === 'running').length;
  const completedCount = executions.filter((e) => e.status === 'completed').length;
  const failedCount = executions.filter((e) => e.status === 'failed').length;
  const openTasks = tasks.filter((t) => t.status === 'open').length;

  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.externalId.toLowerCase().includes(q) ||
        (t.assignee ?? '').toLowerCase().includes(q),
    );
  }, [tasks, searchQuery]);

  const taskExecutions = useMemo(
    () => (selectedTask ? executions.filter((e) => e.taskId === selectedTask.id) : []),
    [executions, selectedTask],
  );

  const handleAction = async (action: ExecutionAction, task: TaskFeedItem) => {
    const isSelectedTask = selectedTask?.id === task.id;
    const repoExists = (id: string | null | undefined) => id && repositories.some((r) => r.id === id);
    const preferredRepoId =
      (isSelectedTask ? executionRepoId : null) ??
      task.suggestedRepositoryId ??
      selectedRepo?.id ??
      null;
    const repoId = repoExists(preferredRepoId)
      ? preferredRepoId
      : repoExists(selectedRepo?.id)
        ? selectedRepo!.id
        : null;
    if (!repoId) {
      toast.error('Select a valid repository first');
      return;
    }
    try {
      const body: CreateExecutionRequest = {
        repositoryId: repoId,
        action,
        taskId: task.id,
        taskExternalId: task.externalId,
        taskTitle: task.title,
        taskDescription: task.description,
        taskSource: task.source,
        publishPullRequest,
        requireCodeChanges,
      };
      const { data } = await api.post<Execution>('/executions', body, {
        headers: { 'Idempotency-Key': createIdempotencyKey() },
      });
      setExecutions((prev) => [data, ...prev]);
      setActiveExecutionId(data.id);
      setTerminalOpen(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create execution'));
    }
  };

  const handleStartDraft = async (task: TaskFeedItem) => {
    if (!task.draftExecutionId) return;
    try {
      const { data } = await api.post<Execution>(`/executions/${task.draftExecutionId}/start`);
      setExecutions((prev) => {
        const exists = prev.some((e) => e.id === data.id);
        return exists ? prev.map((e) => (e.id === data.id ? data : e)) : [data, ...prev];
      });
      setActiveExecutionId(data.id);
      setTerminalOpen(true);
      toast.success('Draft execution started');
      fetchTasks();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to start draft'));
    }
  };

  const handleCancel = async (executionId: string) => {
    try {
      const { data } = await api.post<Execution>(`/executions/${executionId}/cancel`);
      setExecutions((prev) => prev.map((e) => (e.id === executionId ? { ...e, status: data.status } : e)));
      toast.success('Execution cancelled');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to cancel execution'));
    }
  };

  const stats = [
    { label: 'Open Tasks', value: openTasks, color: 'bg-blue-400' },
    { label: 'Running', value: runningCount, color: 'bg-emerald-400', change: runningCount > 0 ? 'live' : undefined },
    { label: 'Completed', value: completedCount, color: 'bg-violet-400' },
    { label: 'Failed', value: failedCount, color: 'bg-red-400' },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-5">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="h-8 w-full rounded-lg bg-foreground/5 pl-9 pr-3 text-sm outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/50 focus:bg-foreground/8 focus:ring-ring/30"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            /
          </kbd>
        </div>

        {availableProviders.length > 1 ? (
          <select
            value={provider ?? ''}
            onChange={(e) => setSelectedProvider(e.target.value as TaskManagerProvider)}
            disabled={syncState !== 'idle'}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium capitalize outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
          >
            {availableProviders.map((p) => (
              <option key={p} value={p}>{p === 'asana' ? 'Asana' : 'Jira'}</option>
            ))}
          </select>
        ) : availableProviders.length === 1 ? (
          <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium capitalize">{availableProviders[0] === 'asana' ? 'Asana' : 'Jira'}</span>
        ) : null}

        {scopes && provider && (
          <ScopeFilter
            scopes={scopes}
            provider={provider}
            selectedWorkspaceId={selectedWorkspaceId}
            selectedProjectId={selectedProjectId}
            selectedProjectKey={selectedProjectKey}
            onWorkspaceChange={setSelectedWorkspaceId}
            onProjectIdChange={setSelectedProjectId}
            onProjectChange={setSelectedProjectKey}
            disabled={syncState === 'starting' || syncState === 'polling'}
          />
        )}

        <div className="ml-auto flex items-center gap-3">
          {runningCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-2.5 py-1 ring-1 ring-blue-500/20">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
              </span>
              <span className="text-[11px] font-medium text-blue-400">{runningCount} running</span>
            </div>
          )}
          <SyncButton syncState={syncState} onClick={handleSync} />
        </div>
      </div>

      {/* Sync progress */}
      {syncState !== 'idle' && <SyncBanner syncState={syncState} progress={progress} />}

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">Loading tasks...</span>
        </div>
      )}

      {/* Error banner */}
      {!loading && (loadError || feedErrors.length > 0) && (
        <div className="mx-5 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-500">
                {loadError ?? 'Some connections failed to load tasks'}
              </p>
              {!loadError && (
                <ul className="mt-1 space-y-0.5">
                  {feedErrors.map((error) => (
                    <li key={error.connectionId} className="text-xs text-amber-500/80">
                      {error.provider}: {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <TaskList
              tasks={filteredTasks}
              selectedTask={selectedTask}
              onSelectTask={setSelectedTask}
              onAction={handleAction}
              onSyncRequest={handleSync}
              hasScopeFilter={selectedWorkspaceId !== null || selectedProjectId !== null || selectedProjectKey !== null}
              isSyncing={syncState === 'starting' || syncState === 'polling'}
            />
          </div>

          {selectedTask ? (
            <TaskDetail
              task={selectedTask}
              executions={taskExecutions}
              onClose={() => setSelectedTask(null)}
              onAction={(action) => handleAction(action, selectedTask)}
              publishPullRequest={publishPullRequest}
              onPublishPullRequestChange={setPublishPullRequest}
              requireCodeChanges={requireCodeChanges}
              onRequireCodeChangesChange={setRequireCodeChanges}
              executionRepoId={executionRepoId}
              onExecutionRepoIdChange={setExecutionRepoId}
              repositories={repositories}
              selectedRepo={selectedRepo}
              onStartDraft={handleStartDraft}
            />
          ) : (
            <ActivityPanel />
          )}
        </div>
      )}

      {/* Terminal */}
      {activeExecution && (
        <TerminalPanel
          execution={activeExecution}
          isOpen={terminalOpen}
          onToggle={() => setTerminalOpen(!terminalOpen)}
          onCancel={() => handleCancel(activeExecution.id)}
        />
      )}
    </div>
  );
}
