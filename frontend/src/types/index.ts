export type TaskSource = 'jira' | 'asana';
export type TaskPrefix = 'fix' | 'feature' | 'chore' | 'plan' | 'refactor';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'closed';
export type ExecutionAction = 'fix' | 'feature' | 'plan';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  externalId: string;
  title: string;
  description: string;
  source: TaskSource;
  prefix: TaskPrefix;
  assignee: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export interface Execution {
  id: string;
  taskId: string;
  taskExternalId: string;
  action: ExecutionAction;
  status: ExecutionStatus;
  output: string;
  createdAt: string;
  completedAt?: string;
}

export interface Repository {
  id: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  isCloned: boolean;
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

export const ALL_PREFIXES = ['fix', 'feature', 'chore', 'plan', 'refactor'] as const;

export interface SettingsResponse {
  githubToken: string | null;
  claudeApiKey: string | null;
}

export type TaskManagerProvider = 'asana' | 'jira';

export interface ConnectionPrefix {
  id: string;
  connectionId: string;
  value: string;
  normalizedValue: string;
  createdAt: string;
}

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
  createdAt: string;
  updatedAt: string;
  prefixes: ConnectionPrefix[];
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
  matchedPrefix: string | null;
  updatedAt: string;
}

export interface TaskFeedConnectionError {
  connectionId: string;
  provider: TaskSource;
  statusCode: number;
  code: TaskFeedErrorCode;
  message: string;
}

export interface TaskFeedResponse {
  repositoryId: string | null;
  appliedPrefixes: string[];
  total: number;
  items: TaskFeedItem[];
  errors: TaskFeedConnectionError[];
}
