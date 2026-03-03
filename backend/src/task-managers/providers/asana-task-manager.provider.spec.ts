import { ConfigService } from '@nestjs/config';
import {
  TaskManagerProviderAuthError,
  TaskManagerProviderNotFoundError,
  TaskManagerProviderRequestError,
} from '../errors/task-manager-provider.errors';
import type { TaskManagerConnectionConfig } from '../interfaces/task-manager-provider.interface';
import { AsanaTaskManagerProvider } from './asana-task-manager.provider';

type AsanaMockState = {
  apiClients: Array<{
    authentications: {
      token: {
        accessToken?: string;
      };
    };
    timeout?: number;
  }>;
  ApiClient: jest.Mock;
  UsersApi: jest.Mock;
  WorkspacesApi: jest.Mock;
  ProjectsApi: jest.Mock;
  TasksApi: jest.Mock;
  usersApi: {
    getUser: jest.Mock;
  };
  workspacesApi: {
    getWorkspace: jest.Mock;
  };
  projectsApi: {
    getProject: jest.Mock;
    getProjectsForWorkspace: jest.Mock;
  };
  tasksApi: {
    getTasks: jest.Mock;
    getTasksForProject: jest.Mock;
    searchTasksForWorkspace: jest.Mock;
  };
  reset: () => void;
};

jest.mock('asana', () => {
  const apiClients: AsanaMockState['apiClients'] = [];
  const usersApi = {
    getUser: jest.fn(),
  };
  const workspacesApi = {
    getWorkspace: jest.fn(),
  };
  const projectsApi = {
    getProject: jest.fn(),
    getProjectsForWorkspace: jest.fn(),
  };
  const tasksApi = {
    getTasks: jest.fn(),
    getTasksForProject: jest.fn(),
    searchTasksForWorkspace: jest.fn(),
  };

  const ApiClient = jest.fn().mockImplementation(() => {
    const client = {
      authentications: {
        token: {},
      },
      timeout: undefined,
    };
    apiClients.push(client);
    return client;
  });

  const UsersApi = jest.fn().mockImplementation(() => usersApi);
  const WorkspacesApi = jest.fn().mockImplementation(() => workspacesApi);
  const ProjectsApi = jest.fn().mockImplementation(() => projectsApi);
  const TasksApi = jest.fn().mockImplementation(() => tasksApi);

  const reset = () => {
    apiClients.length = 0;
    ApiClient.mockClear();
    UsersApi.mockClear();
    WorkspacesApi.mockClear();
    ProjectsApi.mockClear();
    TasksApi.mockClear();
    usersApi.getUser.mockReset();
    workspacesApi.getWorkspace.mockReset();
    projectsApi.getProject.mockReset();
    projectsApi.getProjectsForWorkspace.mockReset();
    tasksApi.getTasks.mockReset();
    tasksApi.getTasksForProject.mockReset();
    tasksApi.searchTasksForWorkspace.mockReset();
  };

  const mockState: AsanaMockState = {
    apiClients,
    ApiClient,
    UsersApi,
    WorkspacesApi,
    ProjectsApi,
    TasksApi,
    usersApi,
    workspacesApi,
    projectsApi,
    tasksApi,
    reset,
  };

  return {
    ApiClient,
    UsersApi,
    WorkspacesApi,
    ProjectsApi,
    TasksApi,
    __mockState: mockState,
  };
});

const asanaMockState = (
  jest.requireMock('asana') as { __mockState: AsanaMockState }
).__mockState;

describe('AsanaTaskManagerProvider', () => {
  const createProvider = (timeoutMs = '4200') => {
    const configService = {
      get: jest.fn((_: string, defaultValue?: string) => {
        if (timeoutMs) {
          return timeoutMs;
        }

        return defaultValue;
      }),
    } as unknown as ConfigService;

    return new AsanaTaskManagerProvider(configService);
  };

  const buildAsanaConfig = (
    overrides: Partial<
      Extract<TaskManagerConnectionConfig, { provider: 'asana' }>
    > = {},
  ): TaskManagerConnectionConfig => ({
    provider: 'asana',
    personalAccessToken: 'asana-token',
    workspaceId: null,
    projectId: null,
    ...overrides,
  });

  beforeEach(() => {
    asanaMockState.reset();
  });

  it('calls SDK v3 user validation endpoint and configures client token/timeout', async () => {
    const provider = createProvider('4321');
    asanaMockState.usersApi.getUser.mockResolvedValue({ data: { gid: 'me' } });

    await provider.validateConnection(buildAsanaConfig());

    expect(asanaMockState.ApiClient).toHaveBeenCalledTimes(1);
    expect(asanaMockState.UsersApi).toHaveBeenCalledTimes(1);
    expect(asanaMockState.usersApi.getUser).toHaveBeenCalledWith('me', {
      opt_fields: ['gid'],
    });
    expect(
      asanaMockState.apiClients[0]?.authentications.token.accessToken,
    ).toBe('asana-token');
    expect(asanaMockState.apiClients[0]?.timeout).toBe(4321);
  });

  it('validates configured workspace and project scopes', async () => {
    const provider = createProvider();
    asanaMockState.usersApi.getUser.mockResolvedValue({ data: { gid: 'me' } });
    asanaMockState.workspacesApi.getWorkspace.mockResolvedValue({
      data: { gid: 'workspace-1' },
    });
    asanaMockState.projectsApi.getProject.mockResolvedValue({
      data: { gid: 'project-1' },
    });

    await provider.validateConnection(
      buildAsanaConfig({
        workspaceId: 'workspace-1',
        projectId: 'project-1',
      }),
    );

    expect(asanaMockState.workspacesApi.getWorkspace).toHaveBeenCalledWith(
      'workspace-1',
      { opt_fields: ['gid'] },
    );
    expect(asanaMockState.projectsApi.getProject).toHaveBeenCalledWith(
      'project-1',
      { opt_fields: ['gid'] },
    );
  });

  it('maps 401/403 SDK errors to TaskManagerProviderAuthError', async () => {
    const provider = createProvider();
    asanaMockState.usersApi.getUser.mockRejectedValue({ status: 401 });

    await expect(
      provider.validateConnection(buildAsanaConfig()),
    ).rejects.toBeInstanceOf(TaskManagerProviderAuthError);
  });

  it('maps 404 SDK errors to TaskManagerProviderNotFoundError', async () => {
    const provider = createProvider();
    asanaMockState.usersApi.getUser.mockResolvedValue({ data: { gid: 'me' } });
    asanaMockState.workspacesApi.getWorkspace.mockRejectedValue({
      response: { status: 404 },
    });

    await expect(
      provider.validateConnection(buildAsanaConfig({ workspaceId: 'missing' })),
    ).rejects.toBeInstanceOf(TaskManagerProviderNotFoundError);
  });

  it('maps unknown SDK errors to TaskManagerProviderRequestError', async () => {
    const provider = createProvider();
    asanaMockState.tasksApi.getTasks.mockRejectedValue(new Error('boom'));

    await expect(
      provider.fetchTasks(buildAsanaConfig(), 10),
    ).rejects.toBeInstanceOf(TaskManagerProviderRequestError);
  });

  it('fetches project-scoped tasks and maps them to ProviderTask', async () => {
    const provider = createProvider();
    asanaMockState.tasksApi.getTasksForProject.mockResolvedValue({
      data: [
        {
          gid: 'task-1',
          name: 'Refactor billing',
          notes: 'Implement SDK v3',
          permalink_url: 'https://app.asana.com/0/1/2',
          completed: false,
          assignee: { name: 'Matus' },
          modified_at: '2026-03-03T12:30:00.000Z',
        },
      ],
    });

    const result = await provider.fetchTasks(
      buildAsanaConfig({ projectId: 'project-1' }),
      15,
    );

    expect(asanaMockState.tasksApi.getTasksForProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        limit: 15,
      }),
    );
    expect(result).toEqual([
      {
        externalId: 'task-1',
        title: 'Refactor billing',
        description: 'Implement SDK v3',
        url: 'https://app.asana.com/0/1/2',
        status: 'open',
        assignee: 'Matus',
        updatedAt: '2026-03-03T12:30:00.000Z',
      },
    ]);
  });

  it('returns empty project list when workspace scope is not configured', async () => {
    const provider = createProvider();

    const result = await provider.fetchProjects(buildAsanaConfig());

    expect(result).toEqual([]);
    expect(
      asanaMockState.projectsApi.getProjectsForWorkspace,
    ).not.toHaveBeenCalled();
  });
});
