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
  ): Promise<AsanaApiEnvelope<AsanaProjectResponse>>;
  getProjectsForWorkspace(
    workspaceId: string,
    opts?: Record<string, unknown>,
  ): Promise<AsanaApiEnvelope<AsanaProjectResponse[]>>;
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

type AsanaWorkspaceResponse = {
  gid?: string;
  name?: string;
};

type AsanaProjectResponse = {
  gid?: string;
  name?: string;
  workspace?: {
    gid?: string;
    name?: string;
  } | null;
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

    const projects = await this.listAllProjectsForWorkspace(
      projectsApi,
      asanaConfig.workspaceId,
      ['gid', 'name'],
      'Unable to fetch Asana projects',
    );

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
    const projectsApi = new AsanaSdk.ProjectsApi(client);

    if (asanaConfig.projectId) {
      let projectResult: AsanaApiEnvelope<AsanaProjectResponse>;
      try {
        projectResult = await projectsApi.getProject(asanaConfig.projectId, {
          opt_fields: ['gid', 'name', 'workspace.gid', 'workspace.name'],
        });
      } catch (error) {
        this.throwMappedAsanaError(
          error,
          `Unable to load Asana project ${asanaConfig.projectId}`,
          { notFoundMessage: 'Asana project not found' },
        );
      }

      const projectId = projectResult.data?.gid ?? asanaConfig.projectId;
      const projectName = projectResult.data?.name ?? projectId;
      const projectWorkspace = projectResult.data?.workspace;
      const workspaceId = projectWorkspace?.gid ?? asanaConfig.workspaceId;
      const workspaceName =
        projectWorkspace?.name ?? asanaConfig.workspaceId ?? workspaceId;

      return [
        {
          type: 'asana_project',
          id: projectId,
          name: projectName,
          parent:
            workspaceId && workspaceName
              ? {
                  type: 'asana_workspace',
                  id: workspaceId,
                  name: workspaceName,
                }
              : undefined,
        },
      ];
    }

    if (asanaConfig.workspaceId) {
      const workspace = await this.getWorkspaceOrThrow(
        workspacesApi,
        asanaConfig.workspaceId,
      );
      const projectScopes = await this.listProjectScopesForWorkspace(
        projectsApi,
        workspace,
      );

      if (projectScopes.length > 0) {
        return projectScopes;
      }

      return [
        {
          type: 'asana_workspace',
          id: workspace.id,
          name: workspace.name,
        },
      ];
    }

    const workspaces = await this.listAllWorkspaces(workspacesApi);
    const scopes: ProviderSyncScope[] = [];

    for (const workspace of workspaces) {
      if (!workspace.gid || !workspace.name) {
        continue;
      }

      const normalizedWorkspace = {
        id: workspace.gid,
        name: workspace.name,
      };
      const projectScopes = await this.listProjectScopesForWorkspace(
        projectsApi,
        normalizedWorkspace,
      );

      if (projectScopes.length > 0) {
        scopes.push(...projectScopes);
      } else {
        scopes.push({
          type: 'asana_workspace',
          id: normalizedWorkspace.id,
          name: normalizedWorkspace.name,
        });
      }
    }

    return scopes;
  }

  async fetchTasksForScope(
    config: TaskManagerConnectionConfig,
    scope: ProviderSyncScope,
    limit: number,
    cursor?: string,
  ): Promise<ProviderScopeTaskPage> {
    const asanaConfig = this.assertAsanaConfig(config);
    const client = this.createApiClient(asanaConfig.personalAccessToken);
    const tasksApi = new AsanaSdk.TasksApi(client);
    const opts: Record<string, unknown> = {
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
    };

    let result: AsanaApiEnvelope<AsanaTaskResponse[]>;
    if (scope.type === 'asana_project') {
      try {
        result = await tasksApi.getTasksForProject(scope.id, opts);
      } catch (error) {
        this.throwMappedAsanaError(
          error,
          `Unable to fetch Asana tasks for project ${scope.id}`,
        );
      }

      return {
        tasks: this.mapTasks(result),
        nextCursor: result.next_page?.offset ?? null,
      };
    }

    if (scope.type === 'asana_workspace') {
      try {
        result = await tasksApi.getTasks({
          workspace: scope.id,
          assignee: 'me',
          ...opts,
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

    throw new TaskManagerProviderConfigurationError(
      'Asana provider received unsupported sync scope type',
    );
  }

  private async getWorkspaceOrThrow(
    workspacesApi: AsanaWorkspacesApi,
    workspaceId: string,
  ): Promise<{ id: string; name: string }> {
    let workspaceResult: AsanaApiEnvelope<AsanaWorkspaceResponse>;
    try {
      workspaceResult = await workspacesApi.getWorkspace(workspaceId, {
        opt_fields: ['gid', 'name'],
      });
    } catch (error) {
      this.throwMappedAsanaError(
        error,
        `Unable to load Asana workspace ${workspaceId}`,
        { notFoundMessage: 'Asana workspace not found' },
      );
    }

    return {
      id: workspaceResult.data?.gid ?? workspaceId,
      name: workspaceResult.data?.name ?? workspaceId,
    };
  }

  private async listProjectScopesForWorkspace(
    projectsApi: AsanaProjectsApi,
    workspace: { id: string; name: string },
  ): Promise<ProviderSyncScope[]> {
    const projects = await this.listAllProjectsForWorkspace(
      projectsApi,
      workspace.id,
      ['gid', 'name', 'workspace.gid', 'workspace.name'],
      `Unable to fetch Asana projects for workspace ${workspace.id}`,
    );

    return projects
      .filter((project): project is AsanaProjectResponse =>
        Boolean(project.gid && project.name),
      )
      .map((project) => ({
        type: 'asana_project' as const,
        id: project.gid ?? '',
        name: project.name ?? '',
        parent: {
          type: 'asana_workspace' as const,
          id: project.workspace?.gid ?? workspace.id,
          name: project.workspace?.name ?? workspace.name,
        },
      }));
  }

  private async listAllWorkspaces(
    workspacesApi: AsanaWorkspacesApi,
  ): Promise<AsanaWorkspaceResponse[]> {
    const workspaces: AsanaWorkspaceResponse[] = [];
    let offset: string | undefined;

    do {
      let result: AsanaApiEnvelope<AsanaWorkspaceResponse[]>;
      const requestOpts: Record<string, unknown> = {
        limit: 100,
        opt_fields: ['gid', 'name'],
      };
      if (offset) {
        requestOpts.offset = offset;
      }

      try {
        result = await workspacesApi.getWorkspaces(requestOpts);
      } catch (error) {
        this.throwMappedAsanaError(error, 'Unable to list Asana workspaces');
      }

      if (Array.isArray(result.data)) {
        workspaces.push(...result.data);
      }
      offset = result.next_page?.offset;
    } while (offset);

    return workspaces;
  }

  private async listAllProjectsForWorkspace(
    projectsApi: AsanaProjectsApi,
    workspaceId: string,
    optFields: string[],
    errorMessage: string,
  ): Promise<AsanaProjectResponse[]> {
    const projects: AsanaProjectResponse[] = [];
    let offset: string | undefined;

    do {
      let result: AsanaApiEnvelope<AsanaProjectResponse[]>;
      const requestOpts: Record<string, unknown> = {
        limit: 100,
        opt_fields: optFields,
      };
      if (offset) {
        requestOpts.offset = offset;
      }

      try {
        result = await projectsApi.getProjectsForWorkspace(
          workspaceId,
          requestOpts,
        );
      } catch (error) {
        this.throwMappedAsanaError(error, errorMessage);
      }

      if (Array.isArray(result.data)) {
        projects.push(...result.data);
      }
      offset = result.next_page?.offset;
    } while (offset);

    return projects;
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
