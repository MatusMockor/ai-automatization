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
  name: string;
  fullName: string;
  isActive: boolean;
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
