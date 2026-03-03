export type TaskManagerProviderType = 'asana' | 'jira';

export type TaskManagerAuthMode = 'basic' | 'bearer';

export type ConnectionStatus = 'connected' | 'invalid' | 'pending';

export type TaskItemStatus =
  | 'open'
  | 'in_progress'
  | 'done'
  | 'closed'
  | 'unknown';

export type AsanaTaskManagerConnectionConfig = {
  provider: 'asana';
  personalAccessToken: string;
  workspaceId: string | null;
  projectId: string | null;
};

export type JiraBasicTaskManagerConnectionConfig = {
  provider: 'jira';
  baseUrl: string;
  projectKey: string | null;
  authMode: 'basic';
  email: string;
  apiToken: string;
};

export type JiraBearerTaskManagerConnectionConfig = {
  provider: 'jira';
  baseUrl: string;
  projectKey: string | null;
  authMode: 'bearer';
  accessToken: string;
};

export type TaskManagerConnectionConfig =
  | AsanaTaskManagerConnectionConfig
  | JiraBasicTaskManagerConnectionConfig
  | JiraBearerTaskManagerConnectionConfig;

export type ProviderTask = {
  externalId: string;
  title: string;
  description: string;
  url: string;
  status: TaskItemStatus;
  assignee: string | null;
  updatedAt: string;
};

export type ProviderProject = {
  id: string;
  name: string;
};

export type ProviderSyncScopeType = 'asana_workspace' | 'jira_project';

export type ProviderSyncScope = {
  type: ProviderSyncScopeType;
  id: string;
  name: string;
};

export type ProviderScopeTaskPage = {
  tasks: ProviderTask[];
  nextCursor: string | null;
};

export interface TaskManagerProvider {
  readonly provider: TaskManagerProviderType;

  validateConnection(config: TaskManagerConnectionConfig): Promise<void>;

  fetchTasks(
    config: TaskManagerConnectionConfig,
    limit: number,
  ): Promise<ProviderTask[]>;

  fetchProjects(
    config: TaskManagerConnectionConfig,
  ): Promise<ProviderProject[]>;

  listSyncScopes(
    config: TaskManagerConnectionConfig,
  ): Promise<ProviderSyncScope[]>;

  fetchTasksForScope(
    config: TaskManagerConnectionConfig,
    scope: ProviderSyncScope,
    limit: number,
    cursor?: string,
  ): Promise<ProviderScopeTaskPage>;
}
