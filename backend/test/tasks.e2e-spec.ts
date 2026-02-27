import { faker } from '@faker-js/faker';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../src/common/encryption/encryption.service';
import { TASK_MANAGER_PROVIDERS } from '../src/task-managers/constants/task-managers.tokens';
import {
  TaskManagerProviderAuthError,
  TaskManagerProviderNotFoundError,
  TaskManagerProviderRequestError,
} from '../src/task-managers/errors/task-manager-provider.errors';
import {
  ProviderTask,
  TaskManagerConnectionConfig,
  TaskManagerProvider,
} from '../src/task-managers/interfaces/task-manager-provider.interface';
import { RepositoryFactory } from './factories/repository.factory';
import { TaskManagerConnectionFactory } from './factories/task-manager-connection.factory';
import { TaskPrefixFactory } from './factories/task-prefix.factory';
import { UserFactory } from './factories/user.factory';
import { createTestApp } from './helpers/test-app.factory';

type LoginSession = {
  accessToken: string;
  userId: string;
};

type FailureKind = 'auth' | 'not_found' | 'request';

class FakeAsanaTaskManagerProvider implements TaskManagerProvider {
  readonly provider = 'asana' as const;

  private readonly tasksByScope = new Map<string, ProviderTask[]>();
  private readonly failuresByScope = new Map<string, FailureKind>();

  seedTasks(
    workspaceId: string | null,
    projectId: string | null,
    tasks: ProviderTask[],
  ): void {
    this.tasksByScope.set(this.buildScopeKey(workspaceId, projectId), tasks);
  }

  seedFailure(
    workspaceId: string | null,
    projectId: string | null,
    failure: FailureKind,
  ): void {
    this.failuresByScope.set(
      this.buildScopeKey(workspaceId, projectId),
      failure,
    );
  }

  reset(): void {
    this.tasksByScope.clear();
    this.failuresByScope.clear();
  }

  async validateConnection(config: TaskManagerConnectionConfig): Promise<void> {
    if (config.provider !== 'asana') {
      throw new Error('Invalid provider config for Asana fake provider');
    }
  }

  async fetchTasks(
    config: TaskManagerConnectionConfig,
    limit: number,
  ): Promise<ProviderTask[]> {
    if (config.provider !== 'asana') {
      throw new Error('Invalid provider config for Asana fake provider');
    }

    const scopeKey = this.buildScopeKey(config.workspaceId, config.projectId);
    this.throwFailure(scopeKey);

    const tasks = this.tasksByScope.get(scopeKey) ?? [];
    return this.sortTasks(tasks).slice(0, limit);
  }

  async fetchProjects(): Promise<Array<{ id: string; name: string }>> {
    return [];
  }

  private buildScopeKey(
    workspaceId: string | null,
    projectId: string | null,
  ): string {
    return `${workspaceId ?? '*'}:${projectId ?? '*'}`;
  }

  private throwFailure(scopeKey: string): void {
    const failure = this.failuresByScope.get(scopeKey);
    if (!failure) {
      return;
    }

    if (failure === 'auth') {
      throw new TaskManagerProviderAuthError('Invalid Asana credentials');
    }

    if (failure === 'not_found') {
      throw new TaskManagerProviderNotFoundError('Asana scope not found');
    }

    throw new TaskManagerProviderRequestError('Asana upstream error');
  }

  private sortTasks(tasks: ProviderTask[]): ProviderTask[] {
    return [...tasks].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }

      return a.externalId.localeCompare(b.externalId);
    });
  }
}

class FakeJiraTaskManagerProvider implements TaskManagerProvider {
  readonly provider = 'jira' as const;

  private readonly tasksByScope = new Map<string, ProviderTask[]>();
  private readonly failuresByScope = new Map<string, FailureKind>();

  seedTasks(
    baseUrl: string,
    projectKey: string | null,
    tasks: ProviderTask[],
  ): void {
    this.tasksByScope.set(this.buildScopeKey(baseUrl, projectKey), tasks);
  }

  seedFailure(
    baseUrl: string,
    projectKey: string | null,
    failure: FailureKind,
  ): void {
    this.failuresByScope.set(this.buildScopeKey(baseUrl, projectKey), failure);
  }

  reset(): void {
    this.tasksByScope.clear();
    this.failuresByScope.clear();
  }

  async validateConnection(config: TaskManagerConnectionConfig): Promise<void> {
    if (config.provider !== 'jira') {
      throw new Error('Invalid provider config for Jira fake provider');
    }
  }

  async fetchTasks(
    config: TaskManagerConnectionConfig,
    limit: number,
  ): Promise<ProviderTask[]> {
    if (config.provider !== 'jira') {
      throw new Error('Invalid provider config for Jira fake provider');
    }

    const scopeKey = this.buildScopeKey(config.baseUrl, config.projectKey);
    this.throwFailure(scopeKey);

    const tasks = this.tasksByScope.get(scopeKey) ?? [];
    return this.sortTasks(tasks).slice(0, limit);
  }

  async fetchProjects(): Promise<Array<{ id: string; name: string }>> {
    return [];
  }

  private buildScopeKey(baseUrl: string, projectKey: string | null): string {
    return `${baseUrl.toLowerCase()}:${projectKey ?? '*'}`;
  }

  private throwFailure(scopeKey: string): void {
    const failure = this.failuresByScope.get(scopeKey);
    if (!failure) {
      return;
    }

    if (failure === 'auth') {
      throw new TaskManagerProviderAuthError('Invalid Jira credentials');
    }

    if (failure === 'not_found') {
      throw new TaskManagerProviderNotFoundError('Jira scope not found');
    }

    throw new TaskManagerProviderRequestError('Jira upstream error');
  }

  private sortTasks(tasks: ProviderTask[]): ProviderTask[] {
    return [...tasks].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }

      return a.externalId.localeCompare(b.externalId);
    });
  }
}

describe('Tasks (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let connectionFactory: TaskManagerConnectionFactory;
  let prefixFactory: TaskPrefixFactory;
  let repositoryFactory: RepositoryFactory;
  let fakeAsanaProvider: FakeAsanaTaskManagerProvider;
  let fakeJiraProvider: FakeJiraTaskManagerProvider;

  beforeAll(async () => {
    fakeAsanaProvider = new FakeAsanaTaskManagerProvider();
    fakeJiraProvider = new FakeJiraTaskManagerProvider();

    const context = await createTestApp({
      env: {
        TASKS_DEFAULT_LIMIT: '100',
        TASKS_MAX_LIMIT: '200',
      },
      providerOverrides: [
        {
          token: TASK_MANAGER_PROVIDERS,
          value: [fakeAsanaProvider, fakeJiraProvider],
        },
      ],
    });

    app = context.app;
    dataSource = context.dataSource;

    userFactory = new UserFactory(dataSource);
    connectionFactory = new TaskManagerConnectionFactory(
      dataSource,
      app.get(EncryptionService),
    );
    prefixFactory = new TaskPrefixFactory(dataSource);
    repositoryFactory = new RepositoryFactory(
      dataSource,
      process.env.REPOSITORIES_BASE_PATH ??
        '/tmp/ai-automation-repositories-test',
    );
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    fakeAsanaProvider.reset();
    fakeJiraProvider.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/tasks should return 401 without JWT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/tasks should return empty payload when user has no task manager connections', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<{
        repositoryId: string | null;
        appliedPrefixes: string[];
        total: number;
        items: unknown[];
        errors: unknown[];
      }>(),
    ).toEqual({
      repositoryId: null,
      appliedPrefixes: [],
      total: 0,
      items: [],
      errors: [],
    });
  });

  it('GET /api/tasks should aggregate tasks from multiple connections with stable ordering', async () => {
    const session = await createLoginSession();

    const asanaWorkspaceId = faker.string.numeric(8);
    const asanaProjectId = faker.string.numeric(8);
    const jiraBaseUrl = 'https://aggregate.atlassian.net';
    const jiraProjectKey = 'AGG';

    const asanaConnection = await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId: asanaWorkspaceId,
      projectId: asanaProjectId,
      scopeKey: `asana:${asanaWorkspaceId}:${asanaProjectId}`,
    });
    await prefixFactory.create({
      connectionId: asanaConnection.id,
      value: 'fix/',
    });

    const jiraConnection = await connectionFactory.create({
      userId: session.userId,
      provider: 'jira',
      baseUrl: jiraBaseUrl,
      projectKey: jiraProjectKey,
      scopeKey: `jira:${jiraBaseUrl.toLowerCase()}:${jiraProjectKey}`,
      authMode: 'bearer',
    });
    await prefixFactory.create({
      connectionId: jiraConnection.id,
      value: 'feature/',
    });

    fakeAsanaProvider.seedTasks(asanaWorkspaceId, asanaProjectId, [
      buildProviderTask({
        externalId: 'A-1',
        title: 'fix/ update backend schema',
        updatedAt: '2026-03-10T10:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'A-2',
        title: 'fix/ add test coverage',
        updatedAt: '2026-03-09T10:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'A-3',
        title: 'chore/ should be filtered by connection prefix',
        updatedAt: '2026-03-11T10:00:00.000Z',
      }),
    ]);
    fakeJiraProvider.seedTasks(jiraBaseUrl, jiraProjectKey, [
      buildProviderTask({
        externalId: 'J-1',
        title: 'feature/ add dashboard endpoint',
        updatedAt: '2026-03-10T10:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'J-2',
        title: 'feature/ align docs',
        updatedAt: '2026-03-08T10:00:00.000Z',
      }),
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      total: number;
      items: Array<{
        id: string;
        connectionId: string;
        externalId: string;
        source: 'asana' | 'jira';
      }>;
      errors: unknown[];
    }>();

    expect(body.total).toBe(4);
    expect(body.items.map((item) => item.externalId)).toEqual([
      'A-1',
      'J-1',
      'A-2',
      'J-2',
    ]);
    expect(
      body.items.every((item) => item.id.startsWith(`${item.connectionId}:`)),
    ).toBe(true);
    expect(body.errors).toEqual([]);
  });

  it('GET /api/tasks should validate repoId ownership when provided', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/tasks?repoId=${repository.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ repositoryId: string | null }>().repositoryId).toBe(
      repository.id,
    );
  });

  it('GET /api/tasks should return 404 for foreign repoId', async () => {
    const ownerSession = await createLoginSession();
    const attackerSession = await createLoginSession();

    const repository = await repositoryFactory.create({
      userId: ownerSession.userId,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/tasks?repoId=${repository.id}`,
      headers: {
        authorization: `Bearer ${attackerSession.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('GET /api/tasks should apply additional query prefixes case-insensitively', async () => {
    const session = await createLoginSession();
    const asanaWorkspaceId = faker.string.numeric(8);
    const asanaProjectId = faker.string.numeric(8);

    await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId: asanaWorkspaceId,
      projectId: asanaProjectId,
      scopeKey: `asana:${asanaWorkspaceId}:${asanaProjectId}`,
    });

    fakeAsanaProvider.seedTasks(asanaWorkspaceId, asanaProjectId, [
      buildProviderTask({
        externalId: 'P-1',
        title: 'fix/ improve auth flow',
        updatedAt: '2026-03-12T10:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'P-2',
        title: 'FEATURE/ add audit logs',
        updatedAt: '2026-03-12T09:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'P-3',
        title: 'chore/ cleanup seeds',
        updatedAt: '2026-03-12T08:00:00.000Z',
      }),
    ]);

    const prefixes = encodeURIComponent('  FIX/ , feature/ ');
    const response = await app.inject({
      method: 'GET',
      url: `/api/tasks?prefixes=${prefixes}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      appliedPrefixes: string[];
      total: number;
      items: Array<{ externalId: string }>;
    }>();

    expect(body.appliedPrefixes).toEqual(['fix/', 'feature/']);
    expect(body.total).toBe(2);
    expect(body.items.map((item) => item.externalId)).toEqual(['P-1', 'P-2']);
  });

  it('GET /api/tasks should return partial success with errors when one connection fails', async () => {
    const session = await createLoginSession();

    const asanaWorkspaceId = faker.string.numeric(8);
    const asanaProjectId = faker.string.numeric(8);
    const jiraBaseUrl = 'https://partial.atlassian.net';
    const jiraProjectKey = 'PART';

    const asanaConnection = await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId: asanaWorkspaceId,
      projectId: asanaProjectId,
      scopeKey: `asana:${asanaWorkspaceId}:${asanaProjectId}`,
    });
    const jiraConnection = await connectionFactory.create({
      userId: session.userId,
      provider: 'jira',
      baseUrl: jiraBaseUrl,
      projectKey: jiraProjectKey,
      scopeKey: `jira:${jiraBaseUrl.toLowerCase()}:${jiraProjectKey}`,
      authMode: 'bearer',
    });

    fakeAsanaProvider.seedTasks(asanaWorkspaceId, asanaProjectId, [
      buildProviderTask({
        externalId: 'OK-1',
        title: 'fix/ healthy provider result',
        updatedAt: '2026-03-13T10:00:00.000Z',
      }),
    ]);
    fakeJiraProvider.seedFailure(jiraBaseUrl, jiraProjectKey, 'request');

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      items: Array<{ externalId: string; connectionId: string }>;
      errors: Array<{
        connectionId: string;
        provider: 'asana' | 'jira';
        statusCode: number;
        code: string;
      }>;
    }>();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.externalId).toBe('OK-1');
    expect(body.items[0]?.connectionId).toBe(asanaConnection.id);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({
      connectionId: jiraConnection.id,
      provider: 'jira',
      statusCode: 502,
      code: 'bad_gateway',
    });
  });

  it('GET /api/tasks should return errors for all failed connections without failing whole request', async () => {
    const session = await createLoginSession();

    const asanaWorkspaceId = faker.string.numeric(8);
    const asanaProjectId = faker.string.numeric(8);
    const jiraBaseUrl = 'https://all-fail.atlassian.net';
    const jiraProjectKey = 'FAIL';

    await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId: asanaWorkspaceId,
      projectId: asanaProjectId,
      scopeKey: `asana:${asanaWorkspaceId}:${asanaProjectId}`,
    });
    await connectionFactory.create({
      userId: session.userId,
      provider: 'jira',
      baseUrl: jiraBaseUrl,
      projectKey: jiraProjectKey,
      scopeKey: `jira:${jiraBaseUrl.toLowerCase()}:${jiraProjectKey}`,
      authMode: 'bearer',
    });

    fakeAsanaProvider.seedFailure(asanaWorkspaceId, asanaProjectId, 'auth');
    fakeJiraProvider.seedFailure(jiraBaseUrl, jiraProjectKey, 'not_found');

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      total: number;
      items: unknown[];
      errors: Array<{ code: string; statusCode: number }>;
    }>();

    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
    expect(body.errors).toHaveLength(2);
    expect(body.errors.map((error) => error.code).sort()).toEqual([
      'bad_request',
      'not_found',
    ]);
    expect(body.errors.map((error) => error.statusCode).sort()).toEqual([
      400, 404,
    ]);
  });

  it('GET /api/tasks should apply global limit after merge and sorting', async () => {
    const session = await createLoginSession();
    const asanaWorkspaceId = faker.string.numeric(8);
    const asanaProjectId = faker.string.numeric(8);
    const jiraBaseUrl = 'https://limit.atlassian.net';
    const jiraProjectKey = 'LIM';

    await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId: asanaWorkspaceId,
      projectId: asanaProjectId,
      scopeKey: `asana:${asanaWorkspaceId}:${asanaProjectId}`,
    });
    await connectionFactory.create({
      userId: session.userId,
      provider: 'jira',
      baseUrl: jiraBaseUrl,
      projectKey: jiraProjectKey,
      scopeKey: `jira:${jiraBaseUrl.toLowerCase()}:${jiraProjectKey}`,
      authMode: 'bearer',
    });

    fakeAsanaProvider.seedTasks(asanaWorkspaceId, asanaProjectId, [
      buildProviderTask({
        externalId: 'A-001',
        title: 'fix/ one',
        updatedAt: '2026-03-14T10:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'A-002',
        title: 'fix/ two',
        updatedAt: '2026-03-14T09:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'A-003',
        title: 'fix/ three',
        updatedAt: '2026-03-14T08:00:00.000Z',
      }),
    ]);
    fakeJiraProvider.seedTasks(jiraBaseUrl, jiraProjectKey, [
      buildProviderTask({
        externalId: 'J-001',
        title: 'feature/ one',
        updatedAt: '2026-03-14T07:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'J-002',
        title: 'feature/ two',
        updatedAt: '2026-03-14T06:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'J-003',
        title: 'feature/ three',
        updatedAt: '2026-03-14T05:00:00.000Z',
      }),
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks?limit=4',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      total: number;
      items: Array<{ externalId: string }>;
    }>();

    expect(body.total).toBe(4);
    expect(body.items).toHaveLength(4);
    expect(body.items.map((item) => item.externalId)).toEqual([
      'A-001',
      'A-002',
      'A-003',
      'J-001',
    ]);
  });

  it('GET /api/tasks should return 400 for invalid limit values', async () => {
    const session = await createLoginSession();

    const invalidLimits = ['0', '-1', '5.7', 'abc', '5abc', '1_000', '1e2'];

    for (const limit of invalidLimits) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/tasks?limit=${encodeURIComponent(limit)}`,
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    }
  });

  const createLoginSession = async (): Promise<LoginSession> => {
    const { user, plainPassword } = await userFactory.create();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: user.email,
        password: plainPassword,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ accessToken: string }>();
    return {
      accessToken: body.accessToken,
      userId: user.id,
    };
  };
});

const buildProviderTask = (input: {
  externalId: string;
  title: string;
  updatedAt: string;
}): ProviderTask => ({
  externalId: input.externalId,
  title: input.title,
  description: faker.lorem.sentence(),
  url: faker.internet.url(),
  status: 'open',
  assignee: faker.person.fullName(),
  updatedAt: input.updatedAt,
});
