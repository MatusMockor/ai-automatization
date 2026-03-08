export type TaskSource = 'jira' | 'asana' | 'manual';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'closed';
export type ExecutionAction = 'fix' | 'feature' | 'plan';
export type ExecutionDraftStatus = 'ready' | 'superseded';
export type AutomationRuleMode = 'suggest' | 'draft';
export type TaskAutomationState = 'none' | 'matched' | 'drafted';
export type ExecutionRole = 'implementation' | 'review' | 'remediation';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExecutionOrchestrationState = 'queued' | 'running' | 'finalizing' | 'awaiting_review_decision' | 'done' | 'failed';
export type AutomationStatus = 'not_applicable' | 'pending' | 'publishing' | 'no_changes' | 'published' | 'failed';
export type ReviewGateStatus =
  | 'not_applicable'
  | 'review_running'
  | 'awaiting_decision'
  | 'decision_continue'
  | 'decision_block'
  | 'remediation_running'
  | 'review_passed'
  | 'timeout_continue';
export type ReviewDecision = 'continue' | 'block' | 'fix';
export type ReviewVerdict = 'pass' | 'fail' | 'error';
export type ExecutionTriggerType = 'manual' | 'automation_rule' | 'schedule';

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
  executionRole: ExecutionRole;
  parentExecutionId: string | null;
  rootExecutionId: string;
  reviewGateStatus: ReviewGateStatus;
  reviewPendingDecisionUntil: string | null;
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
  triggerType: ExecutionTriggerType;
  originRuleId: string | null;
  sourceTaskSnapshotUpdatedAt: string | null;
  isDraft: boolean;
  draftStatus: ExecutionDraftStatus | null;
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

export interface ReviewStateResponse {
  status: ReviewGateStatus;
  cycle: number | null;
  findingsMarkdown: string | null;
  verdict: ReviewVerdict | null;
  pendingDecisionUntil: string | null;
  reviewExecutionId: string | null;
  remediationExecutionId: string | null;
}

export type ExecutionStreamEvent =
  | { type: 'snapshot'; executionId: string; status: ExecutionStatus; automationStatus?: AutomationStatus; output: string; outputTruncated: boolean; lastSequence?: number; sequence?: number; sentAt?: string }
  | { type: 'stdout' | 'stderr'; executionId: string; chunk: string; sequence?: number; sentAt?: string }
  | { type: 'status'; executionId: string; status: ExecutionStatus; errorMessage?: string; sequence?: number; sentAt?: string }
  | { type: 'review'; executionId: string; reviewGateStatus: ReviewGateStatus; cycle: number; message?: string; pendingDecisionUntil?: string; reviewExecutionId?: string; remediationExecutionId?: string; sequence?: number; sentAt?: string }
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
  aiReviewEnabled: boolean;
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
    | 'automation_rule'
    | null;
  matchedRuleId: string | null;
  matchedRuleName: string | null;
  suggestedAction: ExecutionAction | null;
  automationMode: AutomationRuleMode | null;
  draftExecutionId: string | null;
  draftStatus: ExecutionDraftStatus | null;
  automationState: TaskAutomationState;
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

// Automation Rules

export type AutomationRuleScopeType = 'asana_workspace' | 'asana_project' | 'jira_project';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  provider: TaskManagerProvider;
  scopeType: AutomationRuleScopeType | null;
  scopeId: string | null;
  titleContains: string[] | null;
  taskStatuses: TaskFeedStatus[] | null;
  repositoryId: string;
  mode: AutomationRuleMode;
  executionAction: ExecutionAction | null;
  suggestedAction: ExecutionAction | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationRuleRequest {
  name: string;
  provider: TaskManagerProvider;
  repositoryId: string;
  enabled?: boolean;
  priority?: number;
  mode?: AutomationRuleMode;
  scopeType?: AutomationRuleScopeType;
  scopeId?: string;
  titleContains?: string[] | null;
  taskStatuses?: TaskFeedStatus[] | null;
  executionAction?: ExecutionAction | null;
  suggestedAction?: ExecutionAction | null;
}

export interface UpdateAutomationRuleRequest {
  name?: string;
  enabled?: boolean;
  priority?: number;
  provider?: TaskManagerProvider;
  scopeType?: AutomationRuleScopeType | null;
  scopeId?: string | null;
  titleContains?: string[] | null;
  taskStatuses?: TaskFeedStatus[] | null;
  repositoryId?: string;
  mode?: AutomationRuleMode;
  executionAction?: ExecutionAction | null;
  suggestedAction?: ExecutionAction | null;
}
