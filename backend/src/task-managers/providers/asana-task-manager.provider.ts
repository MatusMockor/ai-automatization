import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Asana from 'asana';
import { parsePositiveInteger } from '../../common/utils/parse.utils';
import {
  TaskManagerProviderAuthError,
  TaskManagerProviderConfigurationError,
  TaskManagerProviderNotFoundError,
  TaskManagerProviderRequestError,
} from '../errors/task-manager-provider.errors';
import {
  AsanaTaskManagerConnectionConfig,
  ProviderProject,
  ProviderScopeTaskPage,
  ProviderSyncScope,
  ProviderTask,
  TaskItemStatus,
  TaskManagerConnectionConfig,
  TaskManagerProvider,
} from '../interfaces/task-manager-provider.interface';

type AsanaApiClient = {
  authentications: {
    token: {
      accessToken?: string;
    };
  };
  timeout?: number;
};

type AsanaUsersApi = {
  getUser(
    userId: string,
    opts?: Record<string, unknown>,
  ): Promise<AsanaApiEnvelope<{ gid?: string }>>;
};

type AsanaWorkspacesApi = {
  getWorkspace(
    workspaceId: string,
    opts?: Record<string, unknown>,
  ): Promise<AsanaApiEnvelope<{ gid?: string }>>;
  getWorkspaces(
    opts?: Record<string, unknown>,
  ): Promise<AsanaApiEnvelope<Array<{ gid?: string; name?: string }>>>;
};

type AsanaProjectsApi = {
  getProject(
    projectId: string,
    opts?: Record<string, unknown>,
  ): Promise<AsanaApiEnvelope<{ gid?: string }>>;
  getProjectsForWorkspace(
    workspaceId: string,
    opts?: Record<string, unknown>,
  ): Promise<AsanaApiEnvelope<Array<{ gid?: string; name?: string }>>>;
};

type AsanaTasksApi = {
  getTasks(
    opts?: Record<string, unknown>,
  ): Promise<AsanaApiEnvelope<AsanaTaskResponse[]>>;
  getTasksForProject(
    projectId: string,
    opts?: Record<string, unknown>,
  ): Promise<AsanaApiEnvelope<AsanaTaskResponse[]>>;
};

type AsanaSdkModule = {
  ApiClient: new () => AsanaApiClient;
  UsersApi: new (client: AsanaApiClient) => AsanaUsersApi;
  WorkspacesApi: new (client: AsanaApiClient) => AsanaWorkspacesApi;
  ProjectsApi: new (client: AsanaApiClient) => AsanaProjectsApi;
  TasksApi: new (client: AsanaApiClient) => AsanaTasksApi;
};

type AsanaApiEnvelope<TData> = {
  data?: TData;
  next_page?: {
    offset?: string;
  };
};

type AsanaTaskResponse = {
  gid?: string;
  name?: string;
  notes?: string;
  permalink_url?: string;
  completed?: boolean;
  assignee?: {
    name?: string;
  };
  modified_at?: string;
};

const AsanaSdk = Asana as unknown as AsanaSdkModule;

@Injectable()
export class AsanaTaskManagerProvider implements TaskManagerProvider {
  readonly provider = 'asana' as const;

  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = parsePositiveInteger(
      this.configService.get<string>('TASK_MANAGER_HTTP_TIMEOUT_MS', '15000'),
      15000,
    );
  }

  async validateConnection(config: TaskManagerConnectionConfig): Promise<void> {
    const asanaConfig = this.assertAsanaConfig(config);
    const client = this.createApiClient(asanaConfig.personalAccessToken);
    const usersApi = new AsanaSdk.UsersApi(client);
    const workspacesApi = new AsanaSdk.WorkspacesApi(client);
    const projectsApi = new AsanaSdk.ProjectsApi(client);

    try {
      await usersApi.getUser('me', { opt_fields: ['gid'] });
    } catch (error) {
      this.throwMappedAsanaError(error, 'Unable to validate Asana connection');
    }

    if (asanaConfig.workspaceId) {
      try {
        await workspacesApi.getWorkspace(asanaConfig.workspaceId, {
          opt_fields: ['gid'],
        });
      } catch (error) {
        this.throwMappedAsanaError(
          error,
          'Unable to validate Asana workspace scope',
          {
            notFoundMessage: 'Asana workspace not found',
          },
        );
      }
    }

    if (asanaConfig.projectId) {
      try {
        await projectsApi.getProject(asanaConfig.projectId, {
          opt_fields: ['gid'],
        });
      } catch (error) {
        this.throwMappedAsanaError(
          error,
          'Unable to validate Asana project scope',
          {
            notFoundMessage: 'Asana project not found',
          },
        );
      }
    }
  }

  async fetchTasks(
    config: TaskManagerConnectionConfig,
    limit: number,
  ): Promise<ProviderTask[]> {
    const asanaConfig = this.assertAsanaConfig(config);

    const client = this.createApiClient(asanaConfig.personalAccessToken);
    const tasksApi = new AsanaSdk.TasksApi(client);
    const opts: Record<string, unknown> = {
      limit,
      opt_fields: [
        'gid',
        'name',
        'notes',
        'permalink_url',
        'completed',
        'assignee.name',
        'modified_at',
      ],
    };

    let result: AsanaApiEnvelope<AsanaTaskResponse[]>;
    try {
      if (asanaConfig.projectId) {
        result = await tasksApi.getTasksForProject(asanaConfig.projectId, opts);
      } else if (asanaConfig.workspaceId) {
        result = await tasksApi.getTasks({
          workspace: asanaConfig.workspaceId,
          assignee: 'me',
          limit,
          opt_fields: opts.opt_fields,
        });
      } else {
        result = await tasksApi.getTasks({
          ...opts,
          assignee: 'me',
          sort_by: 'modified_at',
        });
      }
    } catch (error) {
      this.throwMappedAsanaError(error, 'Unable to fetch Asana tasks');
    }

    return this.mapTasks(result);
  }

  async fetchProjects(
    config: TaskManagerConnectionConfig,
  ): Promise<ProviderProject[]> {
    const asanaConfig = this.assertAsanaConfig(config);

    if (!asanaConfig.workspaceId) {
      return [];
    }

    const client = this.createApiClient(asanaConfig.personalAccessToken);
    const projectsApi = new AsanaSdk.ProjectsApi(client);

    let result: AsanaApiEnvelope<Array<{ gid?: string; name?: string }>>;
    try {
      result = await projectsApi.getProjectsForWorkspace(
        asanaConfig.workspaceId,
        {
          limit: 100,
          opt_fields: ['gid', 'name'],
        },
      );
    } catch (error) {
      this.throwMappedAsanaError(error, 'Unable to fetch Asana projects');
    }

    const projects = Array.isArray(result.data) ? result.data : [];

    return projects
      .filter((project): project is { gid: string; name: string } =>
        Boolean(project.gid && project.name),
      )
      .map((project) => ({
        id: project.gid,
        name: project.name,
      }));
  }

  async listSyncScopes(
    config: TaskManagerConnectionConfig,
  ): Promise<ProviderSyncScope[]> {
    const asanaConfig = this.assertAsanaConfig(config);
    const client = this.createApiClient(asanaConfig.personalAccessToken);
    const workspacesApi = new AsanaSdk.WorkspacesApi(client);

    if (asanaConfig.workspaceId) {
      let workspaceResult: AsanaApiEnvelope<{ gid?: string; name?: string }>;
      try {
        workspaceResult = await workspacesApi.getWorkspace(
          asanaConfig.workspaceId,
          {
            opt_fields: ['gid', 'name'],
          },
        );
      } catch (error) {
        this.throwMappedAsanaError(
          error,
          `Unable to load Asana workspace ${asanaConfig.workspaceId}`,
          { notFoundMessage: 'Asana workspace not found' },
        );
      }

      const workspaceId = workspaceResult.data?.gid ?? asanaConfig.workspaceId;
      const workspaceName = workspaceResult.data?.name ?? workspaceId;

      return [
        {
          type: 'asana_workspace',
          id: workspaceId,
          name: workspaceName,
        },
      ];
    }

    let result: AsanaApiEnvelope<Array<{ gid?: string; name?: string }>>;
    try {
      result = await workspacesApi.getWorkspaces({
        limit: 100,
        opt_fields: ['gid', 'name'],
      });
    } catch (error) {
      this.throwMappedAsanaError(error, 'Unable to list Asana workspaces');
    }

    const workspaces = Array.isArray(result.data) ? result.data : [];

    return workspaces
      .filter((workspace): workspace is { gid: string; name: string } =>
        Boolean(workspace.gid && workspace.name),
      )
      .map((workspace) => ({
        type: 'asana_workspace',
        id: workspace.gid,
        name: workspace.name,
      }));
  }

  async fetchTasksForScope(
    config: TaskManagerConnectionConfig,
    scope: ProviderSyncScope,
    limit: number,
    cursor?: string,
  ): Promise<ProviderScopeTaskPage> {
    const asanaConfig = this.assertAsanaConfig(config);
    if (scope.type !== 'asana_workspace') {
      throw new TaskManagerProviderConfigurationError(
        'Asana provider received unsupported sync scope type',
      );
    }

    const client = this.createApiClient(asanaConfig.personalAccessToken);
    const tasksApi = new AsanaSdk.TasksApi(client);

    let result: AsanaApiEnvelope<AsanaTaskResponse[]>;
    try {
      result = await tasksApi.getTasks({
        workspace: scope.id,
        assignee: 'me',
        limit,
        offset: cursor,
        opt_fields: [
          'gid',
          'name',
          'notes',
          'permalink_url',
          'completed',
          'assignee.name',
          'modified_at',
        ],
      });
    } catch (error) {
      this.throwMappedAsanaError(
        error,
        `Unable to fetch Asana tasks for workspace ${scope.id}`,
      );
    }

    return {
      tasks: this.mapTasks(result),
      nextCursor: result.next_page?.offset ?? null,
    };
  }

  private createApiClient(accessToken: string): AsanaApiClient {
    const client = new AsanaSdk.ApiClient();
    client.authentications.token.accessToken = accessToken;
    client.timeout = this.timeoutMs;

    return client;
  }

  private assertAsanaConfig(
    config: TaskManagerConnectionConfig,
  ): AsanaTaskManagerConnectionConfig {
    if (config.provider !== 'asana') {
      throw new TaskManagerProviderConfigurationError(
        'Asana provider received unsupported connection config',
      );
    }

    return config;
  }

  private throwMappedAsanaError(
    error: unknown,
    message: string,
    options: { notFoundMessage?: string } = {},
  ): never {
    if (
      error instanceof TaskManagerProviderAuthError ||
      error instanceof TaskManagerProviderNotFoundError ||
      error instanceof TaskManagerProviderRequestError
    ) {
      throw error;
    }

    const statusCode = this.extractStatusCode(error);

    if (statusCode === 401 || statusCode === 403) {
      throw new TaskManagerProviderAuthError(
        'Asana credentials are invalid or do not have required access',
      );
    }

    if (statusCode === 404) {
      throw new TaskManagerProviderNotFoundError(
        options.notFoundMessage ?? 'Asana resource not found',
      );
    }

    throw new TaskManagerProviderRequestError(message, statusCode);
  }

  private extractStatusCode(error: unknown): number | undefined {
    const candidate = error as {
      status?: number;
      statusCode?: number;
      response?: { status?: number };
      value?: { status?: number };
    };

    return (
      candidate?.statusCode ??
      candidate?.status ??
      candidate?.response?.status ??
      candidate?.value?.status
    );
  }

  private mapStatus(task: AsanaTaskResponse): TaskItemStatus {
    if (task.completed === true) {
      return 'done';
    }

    return 'open';
  }

  private normalizeTimestamp(value: string | undefined): string {
    if (!value) {
      return new Date(0).toISOString();
    }

    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      return new Date(0).toISOString();
    }

    return timestamp.toISOString();
  }

  private mapTasks(
    result: AsanaApiEnvelope<AsanaTaskResponse[]>,
  ): ProviderTask[] {
    const tasks = Array.isArray(result.data) ? result.data : [];

    return tasks
      .filter((task): task is AsanaTaskResponse =>
        Boolean(task.gid && task.name),
      )
      .map((task) => ({
        externalId: task.gid ?? '',
        title: task.name ?? '',
        description: task.notes ?? '',
        url: task.permalink_url ?? '',
        status: this.mapStatus(task),
        assignee: task.assignee?.name ?? null,
        updatedAt: this.normalizeTimestamp(task.modified_at),
      }));
  }
}
