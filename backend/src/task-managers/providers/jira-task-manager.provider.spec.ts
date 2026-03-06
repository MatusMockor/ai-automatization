import { ConfigService } from '@nestjs/config';
import {
  TaskManagerProviderAuthError,
  TaskManagerProviderNotFoundError,
  TaskManagerProviderRequestError,
} from '../errors/task-manager-provider.errors';
import type { TaskManagerConnectionConfig } from '../interfaces/task-manager-provider.interface';
import { JiraTaskManagerProvider } from './jira-task-manager.provider';

type JiraMockState = {
  configs: Array<Record<string, unknown>>;
  Version3Client: jest.Mock;
  myself: {
    getCurrentUser: jest.Mock;
  };
  projects: {
    getProject: jest.Mock;
    searchProjects: jest.Mock;
  };
  issueSearch: {
    searchForIssuesUsingJqlEnhancedSearch: jest.Mock;
  };
  reset: () => void;
};

jest.mock('jira.js', () => {
  const configs: JiraMockState['configs'] = [];
  const myself = {
    getCurrentUser: jest.fn(),
  };
  const projects = {
    getProject: jest.fn(),
    searchProjects: jest.fn(),
  };
  const issueSearch = {
    searchForIssuesUsingJqlEnhancedSearch: jest.fn(),
  };

  const Version3Client = jest.fn().mockImplementation((config) => {
    configs.push(config as Record<string, unknown>);

    return {
      myself,
      projects,
      issueSearch,
    };
  });

  const reset = () => {
    configs.length = 0;
    Version3Client.mockClear();
    myself.getCurrentUser.mockReset();
    projects.getProject.mockReset();
    projects.searchProjects.mockReset();
    issueSearch.searchForIssuesUsingJqlEnhancedSearch.mockReset();
  };

  const mockState: JiraMockState = {
    configs,
    Version3Client,
    myself,
    projects,
    issueSearch,
    reset,
  };

  return {
    Version3Client,
    __mockState: mockState,
  };
});

const jiraMockState = (
  jest.requireMock('jira.js') as { __mockState: JiraMockState }
).__mockState;

describe('JiraTaskManagerProvider', () => {
  const createProvider = (timeoutMs = '4200') => {
    const configService = {
      get: jest.fn(
        (_: string, defaultValue?: string) => timeoutMs || defaultValue,
      ),
    } as unknown as ConfigService;

    return new JiraTaskManagerProvider(configService);
  };

  const buildJiraConfig = (
    overrides: Partial<
      Extract<TaskManagerConnectionConfig, { provider: 'jira' }>
    > = {},
  ): TaskManagerConnectionConfig => ({
    provider: 'jira',
    baseUrl: 'https://example.atlassian.net',
    projectKey: 'SCRUM',
    authMode: 'basic',
    email: 'user@example.com',
    apiToken: 'jira-token',
    ...overrides,
  });

  beforeEach(() => {
    jiraMockState.reset();
  });

  it('validates Jira connection and configured project scope', async () => {
    const provider = createProvider();
    jiraMockState.myself.getCurrentUser.mockResolvedValue({ accountId: 'me' });
    jiraMockState.projects.getProject.mockResolvedValue({
      key: 'SCRUM',
      name: 'Scrum',
    });

    await provider.validateConnection(buildJiraConfig());

    expect(jiraMockState.Version3Client).toHaveBeenCalledTimes(1);
    expect(jiraMockState.configs[0]).toMatchObject({
      host: 'https://example.atlassian.net',
      authentication: {
        basic: {
          email: 'user@example.com',
          apiToken: 'jira-token',
        },
      },
    });
    expect(jiraMockState.myself.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(jiraMockState.projects.getProject).toHaveBeenCalledWith({
      projectIdOrKey: 'SCRUM',
    });
  });

  it('fetches Jira tasks through enhanced search', async () => {
    const provider = createProvider();
    jiraMockState.issueSearch.searchForIssuesUsingJqlEnhancedSearch.mockResolvedValue(
      {
        issues: [
          {
            key: 'SCRUM-1',
            fields: {
              summary: 'Fix sync',
              description: { type: 'doc' },
              status: { name: 'In Progress' },
              assignee: { displayName: 'Matus' },
              updated: '2026-03-06T10:20:30.000Z',
            },
          },
        ],
      },
    );

    const result = await provider.fetchTasks(buildJiraConfig(), 15);

    expect(
      jiraMockState.issueSearch.searchForIssuesUsingJqlEnhancedSearch,
    ).toHaveBeenCalledWith({
      jql: 'project = "SCRUM" ORDER BY updated DESC',
      nextPageToken: undefined,
      maxResults: 15,
      fields: ['summary', 'description', 'status', 'assignee', 'updated'],
    });
    expect(result).toEqual([
      {
        externalId: 'SCRUM-1',
        title: 'Fix sync',
        description: JSON.stringify({ type: 'doc' }),
        url: 'https://example.atlassian.net/browse/SCRUM-1',
        status: 'in_progress',
        assignee: 'Matus',
        updatedAt: '2026-03-06T10:20:30.000Z',
      },
    ]);
  });

  it('uses Jira nextPageToken pagination for scoped sync fetches', async () => {
    const provider = createProvider();
    jiraMockState.issueSearch.searchForIssuesUsingJqlEnhancedSearch.mockResolvedValue(
      {
        issues: [
          {
            key: 'SCRUM-2',
            fields: {
              summary: 'Second task',
              description: '',
              status: { name: 'Open' },
              assignee: null,
              updated: '2026-03-06T11:00:00.000Z',
            },
          },
        ],
        nextPageToken: 'cursor-2',
      },
    );

    const page = await provider.fetchTasksForScope(
      buildJiraConfig(),
      { type: 'jira_project', id: 'SCRUM', name: 'Scrum' },
      50,
      'cursor-1',
    );

    expect(
      jiraMockState.issueSearch.searchForIssuesUsingJqlEnhancedSearch,
    ).toHaveBeenCalledWith({
      jql: 'project = "SCRUM" ORDER BY updated DESC',
      nextPageToken: 'cursor-1',
      maxResults: 50,
      fields: ['summary', 'description', 'status', 'assignee', 'updated'],
    });
    expect(page.nextCursor).toBe('cursor-2');
    expect(page.tasks).toHaveLength(1);
    expect(page.tasks[0]?.externalId).toBe('SCRUM-2');
  });

  it('maps 401 Jira errors to TaskManagerProviderAuthError', async () => {
    const provider = createProvider();
    jiraMockState.myself.getCurrentUser.mockRejectedValue({ status: 401 });

    await expect(
      provider.validateConnection(buildJiraConfig()),
    ).rejects.toBeInstanceOf(TaskManagerProviderAuthError);
  });

  it('maps 404 Jira project validation errors to TaskManagerProviderNotFoundError', async () => {
    const provider = createProvider();
    jiraMockState.myself.getCurrentUser.mockResolvedValue({ accountId: 'me' });
    jiraMockState.projects.getProject.mockRejectedValue({
      response: { status: 404 },
    });

    await expect(
      provider.validateConnection(buildJiraConfig()),
    ).rejects.toBeInstanceOf(TaskManagerProviderNotFoundError);
  });

  it('includes sanitized Jira response detail in request errors', async () => {
    const provider = createProvider();
    jiraMockState.issueSearch.searchForIssuesUsingJqlEnhancedSearch.mockRejectedValue(
      {
        status: 400,
        response: {
          errorMessages: ['No issues found for user@example.com'],
          errors: {
            jql: 'Bearer abc123 is not allowed for this query',
          },
        },
      },
    );

    await expect(
      provider.fetchTasks(buildJiraConfig(), 10),
    ).rejects.toMatchObject({
      name: 'TaskManagerProviderRequestError',
      message:
        'Unable to fetch Jira tasks: No issues found for [redacted-email]; Bearer [redacted] is not allowed for this query',
      statusCode: 400,
    } satisfies Partial<TaskManagerProviderRequestError>);
  });

  it('redacts basic auth tokens that include base64 padding', async () => {
    const provider = createProvider();
    jiraMockState.issueSearch.searchForIssuesUsingJqlEnhancedSearch.mockRejectedValue(
      {
        status: 400,
        response: {
          errorMessages: [
            'Authorization header Basic dXNlcjpwYXNz== is invalid',
          ],
        },
      },
    );

    await expect(
      provider.fetchTasks(buildJiraConfig(), 10),
    ).rejects.toMatchObject({
      name: 'TaskManagerProviderRequestError',
      message:
        'Unable to fetch Jira tasks: Authorization header Basic [redacted] is invalid',
      statusCode: 400,
    } satisfies Partial<TaskManagerProviderRequestError>);
  });
});
