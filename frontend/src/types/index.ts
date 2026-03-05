export type TaskSource = 'jira' | 'asana' | 'manual';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'closed';
export type ExecutionAction = 'fix' | 'feature' | 'plan';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExecutionOrchestrationState = 'queued' | 'running' | 'finalizing' | 'done' | 'failed';
export type AutomationStatus = 'not_applicable' | 'pending' | 'publishing' | 'no_changes' | 'published' | 'failed';

export interface Execution {
  id: string;
  repositoryId: string;
  taskId: string;
  taskExternalId: string;
  taskTitle: string;
  taskSource: TaskSource;
  action: ExecutionAction;
  status: ExecutionStatus;
  output: string;
  outputTruncated: boolean;
  exitCode: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  publishPullRequest: boolean;
  requireCodeChanges: boolean;
  implementationAttempts: number;
  orchestrationState: ExecutionOrchestrationState;
  automationStatus: AutomationStatus;
  automationErrorMessage: string | null;
  automationAttempts: number;
  branchName: string | null;
  commitSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  pullRequestTitle: string | null;
  automationCompletedAt: string | null;
  idempotencyKey: string | null;
}

export interface CreateExecutionRequest {
  repositoryId: string;
  action: ExecutionAction;
  taskId: string;
  taskExternalId: string;
  taskTitle: string;
  taskDescription?: string;
  taskSource: TaskSource;
  publishPullRequest?: boolean;
  requireCodeChanges?: boolean;
}

export type ExecutionStreamEvent =
  | { type: 'snapshot'; executionId: string; status: ExecutionStatus; automationStatus?: AutomationStatus; output: string; outputTruncated: boolean; lastSequence?: number; sequence?: number; sentAt?: string }
  | { type: 'stdout' | 'stderr'; executionId: string; chunk: string; sequence?: number; sentAt?: string }
  | { type: 'status'; executionId: string; status: ExecutionStatus; errorMessage?: string; sequence?: number; sentAt?: string }
  | { type: 'publication'; executionId: string; automationStatus: AutomationStatus; branchName?: string; pullRequestUrl?: string; message?: string; sequence?: number; sentAt?: string }
  | { type: 'completed' | 'error'; executionId: string; status: ExecutionStatus; exitCode: number | null; errorMessage?: string; sequence?: number; sentAt?: string };

export interface Repository {
  id: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  isCloned: boolean;
  hasCheckProfileOverride: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  type: 'execution_started' | 'execution_completed' | 'execution_failed' | 'user_connected' | 'repo_synced';
  message: string;
  detail: string;
  timestamp: string;
}

export interface ManualTask {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PreCommitCheckMode = 'warn' | 'block';
export type PreCommitStepPreset = 'format' | 'lint' | 'test';
export type PreCommitRuntimeLanguage = 'php' | 'node';

export interface PreCommitChecksProfile {
  enabled: boolean;
  mode: PreCommitCheckMode;
  runner: { type: 'compose_service'; service: string };
  steps: { preset: PreCommitStepPreset; enabled: boolean }[];
  runtime?: { language: PreCommitRuntimeLanguage; version: string };
}

export interface SettingsResponse {
  githubToken: string | null;
  claudeOauthToken: string | null;
  executionTimeoutMs: number | null;
  preCommitChecksDefault: PreCommitChecksProfile | null;
}

export type TaskManagerProvider = 'asana' | 'jira';

export interface TaskManagerConnection {
  id: string;
  provider: TaskManagerProvider;
  name: string | null;
  status: 'connected' | 'invalid' | 'pending';
  baseUrl: string | null;
  workspaceId: string | null;
  projectId: string | null;
  projectKey: string | null;
  hasSecret: boolean;
  lastValidatedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskFeedStatus = 'open' | 'in_progress' | 'done' | 'closed' | 'unknown';
export type TaskFeedErrorCode = 'bad_request' | 'not_found' | 'bad_gateway' | 'unknown';

export interface TaskFeedItem {
  id: string;
  connectionId: string;
  externalId: string;
  title: string;
  description: string;
  url: string;
  status: TaskFeedStatus;
  assignee: string | null;
  source: TaskSource;
  primaryScopeType: 'asana_workspace' | 'asana_project' | 'jira_project' | null;
  primaryScopeId: string | null;
  primaryScopeName: string | null;
  hasMultipleScopes: boolean;
  suggestedRepositoryId: string | null;
  repositorySelectionSource:
    | 'asana_project'
    | 'asana_workspace'
    | 'jira_project'
    | 'provider_default'
    | null;
  updatedAt: string;
}

export interface TaskFeedConnectionError {
  connectionId: string;
  provider: TaskManagerProvider;
  statusCode: number;
  code: TaskFeedErrorCode;
  message: string;
}

export interface TaskFeedResponse {
  repositoryId: string | null;
  total: number;
  items: TaskFeedItem[];
  errors: TaskFeedConnectionError[];
}

export type SyncRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface SyncRun {
  id: string;
  status: SyncRunStatus;
  connectionsTotal: number;
  connectionsDone: number;
  tasksUpserted: number;
  tasksDeleted: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartSyncResponse {
  runId: string;
  status: SyncRunStatus;
}

export interface StartSyncRequest {
  provider: TaskManagerProvider;
}

export interface AsanaWorkspaceScope {
  id: string;
  name: string;
  taskCount: number;
}

export interface JiraProjectScope {
  key: string;
  name: string;
  taskCount: number;
}

export interface AsanaProjectScope {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  taskCount: number;
}

export interface TaskScopesResponse {
  asanaWorkspaces: AsanaWorkspaceScope[];
  asanaProjects: AsanaProjectScope[];
  jiraProjects: JiraProjectScope[];
}

// Repository Defaults

export type RepositoryDefaultScopeType = 'asana_project' | 'asana_workspace' | 'jira_project';

export interface TaskRepositoryDefaultItem {
  id: string;
  provider: TaskManagerProvider;
  scopeType: RepositoryDefaultScopeType | null;
  scopeId: string | null;
  repositoryId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRepositoryDefaultsResponse {
  items: TaskRepositoryDefaultItem[];
}

export interface UpsertRepositoryDefaultRequest {
  provider: TaskManagerProvider;
  repositoryId: string;
  scopeType?: RepositoryDefaultScopeType;
  scopeId?: string;
}

export interface DeleteRepositoryDefaultRequest {
  provider: TaskManagerProvider;
  scopeType?: RepositoryDefaultScopeType;
  scopeId?: string;
}
