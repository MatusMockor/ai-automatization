import { faker } from '@faker-js/faker';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../src/common/encryption/encryption.service';
import { TaskManagerConnection } from '../src/task-managers/entities/task-manager-connection.entity';
import {
  TaskManagerProviderAuthError,
  TaskManagerProviderNotFoundError,
  TaskManagerProviderRequestError,
} from '../src/task-managers/errors/task-manager-provider.errors';
import { TASK_MANAGER_PROVIDERS } from '../src/task-managers/constants/task-managers.tokens';
import {
  ProviderTask,
  ProviderSyncScope,
  TaskManagerConnectionConfig,
  TaskManagerProvider,
} from '../src/task-managers/interfaces/task-manager-provider.interface';
import { TaskManagerConnectionFactory } from './factories/task-manager-connection.factory';
import { UserFactory } from './factories/user.factory';
import { createTestApp } from './helpers/test-app.factory';

type LoginSession = {
  accessToken: string;
  userId: string;
};

class FakeAsanaTaskManagerProvider implements TaskManagerProvider {
  readonly provider = 'asana' as const;

  private readonly tasksByScope = new Map<string, ProviderTask[]>();

  seedTasks(
    workspaceId: string | null,
    projectId: string | null,
    tasks: ProviderTask[],
  ): void {
    this.tasksByScope.set(this.buildScopeKey(workspaceId, projectId), tasks);
  }

  reset(): void {
    this.tasksByScope.clear();
  }

  async validateConnection(config: TaskManagerConnectionConfig): Promise<void> {
    if (config.provider !== 'asana') {
      throw new Error('Invalid provider config for Asana fake provider');
    }

    if (config.personalAccessToken.toLowerCase().startsWith('invalid')) {
      throw new TaskManagerProviderAuthError('Invalid Asana credentials');
    }

    if (config.workspaceId === 'missing-workspace') {
      throw new TaskManagerProviderNotFoundError('Asana workspace not found');
    }

    if (config.projectId === 'missing-project') {
      throw new TaskManagerProviderNotFoundError('Asana project not found');
    }
  }

  async fetchTasks(
    config: TaskManagerConnectionConfig,
    limit: number,
  ): Promise<ProviderTask[]> {
    if (config.provider !== 'asana') {
      throw new Error('Invalid provider config for Asana fake provider');
    }

    const tasks =
      this.tasksByScope.get(
        this.buildScopeKey(config.workspaceId, config.projectId),
      ) ?? [];

    return this.sortTasks(tasks).slice(0, limit);
  }

  async fetchProjects(): Promise<Array<{ id: string; name: string }>> {
    return [];
  }

  async listSyncScopes(): Promise<
    Array<{ type: 'asana_workspace'; id: string; name: string }>
  > {
    return [];
  }

  async fetchTasksForScope(
    _config: TaskManagerConnectionConfig,
    _scope: ProviderSyncScope,
    _limit: number,
    _cursor?: string,
  ): Promise<{
    tasks: ProviderTask[];
    nextCursor: string | null;
  }> {
    return {
      tasks: [],
      nextCursor: null,
    };
  }

  private buildScopeKey(
    workspaceId: string | null,
    projectId: string | null,
  ): string {
    return `${workspaceId ?? '*'}:${projectId ?? '*'}`;
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

  seedTasks(
    baseUrl: string,
    projectKey: string | null,
    tasks: ProviderTask[],
  ): void {
    this.tasksByScope.set(this.buildScopeKey(baseUrl, projectKey), tasks);
  }

  reset(): void {
    this.tasksByScope.clear();
  }

  async validateConnection(config: TaskManagerConnectionConfig): Promise<void> {
    if (config.provider !== 'jira') {
      throw new Error('Invalid provider config for Jira fake provider');
    }

    const secret =
      config.authMode === 'basic' ? config.apiToken : config.accessToken;

    if (secret.toLowerCase().startsWith('invalid')) {
      throw new TaskManagerProviderAuthError('Invalid Jira credentials');
    }

    if (config.projectKey === 'MISSING') {
      throw new TaskManagerProviderNotFoundError('Jira project not found');
    }

    if (config.baseUrl.includes('gateway-failure')) {
      throw new TaskManagerProviderRequestError('Upstream Jira error');
    }
  }

  async fetchTasks(
    config: TaskManagerConnectionConfig,
    limit: number,
  ): Promise<ProviderTask[]> {
    if (config.provider !== 'jira') {
      throw new Error('Invalid provider config for Jira fake provider');
    }

    const tasks =
      this.tasksByScope.get(
        this.buildScopeKey(config.baseUrl, config.projectKey),
      ) ?? [];

    return this.sortTasks(tasks).slice(0, limit);
  }

  async fetchProjects(): Promise<Array<{ id: string; name: string }>> {
    return [];
  }

  async listSyncScopes(): Promise<
    Array<{ type: 'jira_project'; id: string; name: string }>
  > {
    return [];
  }

  async fetchTasksForScope(
    _config: TaskManagerConnectionConfig,
    _scope: ProviderSyncScope,
    _limit: number,
    _cursor?: string,
  ): Promise<{
    tasks: ProviderTask[];
    nextCursor: string | null;
  }> {
    return {
      tasks: [],
      nextCursor: null,
    };
  }

  private buildScopeKey(baseUrl: string, projectKey: string | null): string {
    return `${baseUrl.toLowerCase()}:${projectKey ?? '*'}`;
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

describe('TaskManagers (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let connectionFactory: TaskManagerConnectionFactory;
  let fakeAsanaProvider: FakeAsanaTaskManagerProvider;
  let fakeJiraProvider: FakeJiraTaskManagerProvider;

  beforeAll(async () => {
    fakeAsanaProvider = new FakeAsanaTaskManagerProvider();
    fakeJiraProvider = new FakeJiraTaskManagerProvider();

    const context = await createTestApp({
      env: {
        TASK_MANAGER_DEFAULT_TASK_LIMIT: '100',
        TASK_MANAGER_MAX_TASK_LIMIT: '100',
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
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    fakeAsanaProvider.reset();
    fakeJiraProvider.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/task-managers/connections should return 401 without JWT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/task-managers/connections',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/task-managers/connections should return only authenticated user connections', async () => {
    const ownerSession = await createLoginSession();
    const otherSession = await createLoginSession();

    const ownerConnection = await connectionFactory.create({
      userId: ownerSession.userId,
      provider: 'asana',
      scopeKey: `asana:${faker.string.numeric(6)}:${faker.string.numeric(6)}`,
    });

    await connectionFactory.create({
      userId: otherSession.userId,
      provider: 'jira',
      baseUrl: 'https://other.atlassian.net',
      scopeKey: `jira:https://other.atlassian.net:${faker.string.alpha({ length: 4 }).toUpperCase()}`,
      authMode: 'bearer',
      secret: `bearer-${faker.string.alphanumeric(16)}`,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${ownerSession.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Array<{ id: string }>>();

    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(ownerConnection.id);
  });

  it('POST /api/task-managers/connections should create Asana connection', async () => {
    const session = await createLoginSession();
    const workspaceId = faker.string.numeric(8);
    const projectId = faker.string.numeric(8);

    const response = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'asana',
        name: 'Asana Product',
        personalAccessToken: `asana-${faker.string.alphanumeric(24)}`,
        workspaceId,
        projectId,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      id: string;
      provider: string;
      workspaceId: string | null;
      projectId: string | null;
      hasSecret: boolean;
    }>();

    expect(body.provider).toBe('asana');
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.projectId).toBe(projectId);
    expect(body.hasSecret).toBe(true);

    const storedConnection = await dataSource
      .getRepository(TaskManagerConnection)
      .findOneBy({ id: body.id, userId: session.userId });

    expect(storedConnection).not.toBeNull();
    expect(storedConnection?.provider).toBe('asana');
    expect(storedConnection?.secretEncrypted).not.toContain('asana-');
  });

  it('POST /api/task-managers/connections should create Jira basic connection', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'jira',
        name: 'Jira Basic',
        baseUrl: 'https://sample.atlassian.net',
        authMode: 'basic',
        email: faker.internet.email().toLowerCase(),
        apiToken: `jira-${faker.string.alphanumeric(24)}`,
        projectKey: 'BE',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      provider: string;
      projectKey: string | null;
    }>();
    expect(body.provider).toBe('jira');
    expect(body.projectKey).toBe('BE');
  });

  it('POST /api/task-managers/connections should create Jira bearer connection', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'jira',
        baseUrl: 'https://sample-bearer.atlassian.net',
        authMode: 'bearer',
        accessToken: `bearer-${faker.string.alphanumeric(24)}`,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ provider: string }>().provider).toBe('jira');
  });

  it('POST /api/task-managers/connections should return 409 for duplicated scope', async () => {
    const session = await createLoginSession();
    const payload = {
      provider: 'asana',
      personalAccessToken: `asana-${faker.string.alphanumeric(24)}`,
      workspaceId: '12345',
      projectId: '11111',
    };

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload,
    });

    expect(firstResponse.statusCode).toBe(201);

    const duplicateResponse = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        ...payload,
        personalAccessToken: `asana-${faker.string.alphanumeric(24)}`,
      },
    });

    expect(duplicateResponse.statusCode).toBe(409);
  });

  it('POST /api/task-managers/connections should return 400 for invalid provider credentials', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'jira',
        baseUrl: 'https://sample.atlassian.net',
        authMode: 'bearer',
        accessToken: `invalid-${faker.string.alphanumeric(10)}`,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('DELETE /api/task-managers/connections/:id should delete owned connection', async () => {
    const session = await createLoginSession();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'asana',
        personalAccessToken: `asana-${faker.string.alphanumeric(24)}`,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const connectionId = createResponse.json<{ id: string }>().id;

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/task-managers/connections/${connectionId}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(204);

    const storedConnection = await dataSource
      .getRepository(TaskManagerConnection)
      .findOneBy({ id: connectionId });

    expect(storedConnection).toBeNull();
  });

  it('DELETE /api/task-managers/connections/:id should return 404 for foreign connection', async () => {
    const ownerSession = await createLoginSession();
    const attackerSession = await createLoginSession();

    const connection = await connectionFactory.create({
      userId: ownerSession.userId,
      provider: 'asana',
      scopeKey: `asana:${faker.string.numeric(8)}:${faker.string.numeric(8)}`,
      secret: `asana-${faker.string.alphanumeric(16)}`,
    });

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/task-managers/connections/${connection.id}`,
      headers: {
        authorization: `Bearer ${attackerSession.accessToken}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(404);
  });

  it('GET /api/task-managers/connections/:id/tasks should return provider tasks without prefix filtering', async () => {
    const session = await createLoginSession();
    const workspaceId = faker.string.numeric(8);
    const projectId = faker.string.numeric(8);

    fakeAsanaProvider.seedTasks(workspaceId, projectId, [
      buildProviderTask({
        externalId: 'A-2',
        title: 'Chore update docs',
        updatedAt: '2026-02-10T11:00:00.000Z',
      }),
      buildProviderTask({
        externalId: 'A-1',
        title: 'Fix login flow',
        updatedAt: '2026-02-11T11:00:00.000Z',
      }),
    ]);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'asana',
        personalAccessToken: `asana-${faker.string.alphanumeric(24)}`,
        workspaceId,
        projectId,
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const connectionId = createResponse.json<{ id: string }>().id;

    const tasksResponse = await app.inject({
      method: 'GET',
      url: `/api/task-managers/connections/${connectionId}/tasks`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(tasksResponse.statusCode).toBe(200);
    const body = tasksResponse.json<{
      total: number;
      items: Array<{ externalId: string }>;
    }>();

    expect(body.total).toBe(2);
    expect(body.items.map((task) => task.externalId)).toEqual(['A-1', 'A-2']);
  });

  it('GET /api/task-managers/connections/:id/tasks should respect limit query and stable ordering', async () => {
    const session = await createLoginSession();
    const baseUrl = 'https://sample.atlassian.net';
    const projectKey = 'BE';

    const seededTasks: ProviderTask[] = [];
    for (let index = 0; index < 120; index += 1) {
      seededTasks.push(
        buildProviderTask({
          externalId: `BE-${String(index + 1).padStart(3, '0')}`,
          title: `fix/ issue ${index + 1}`,
          updatedAt: `2026-02-${String(20 - Math.floor(index / 6)).padStart(2, '0')}T10:00:00.000Z`,
        }),
      );
    }

    fakeJiraProvider.seedTasks(baseUrl, projectKey, seededTasks);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/task-managers/connections',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'jira',
        baseUrl,
        projectKey,
        authMode: 'bearer',
        accessToken: `bearer-${faker.string.alphanumeric(24)}`,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const connectionId = createResponse.json<{ id: string }>().id;

    const tasksResponse = await app.inject({
      method: 'GET',
      url: `/api/task-managers/connections/${connectionId}/tasks?limit=500`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(tasksResponse.statusCode).toBe(200);
    const body = tasksResponse.json<{
      total: number;
      items: Array<{ externalId: string; updatedAt: string }>;
    }>();

    expect(body.total).toBe(100);
    expect(body.items).toHaveLength(100);

    const sortedItems = [...body.items].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }

      return a.externalId.localeCompare(b.externalId);
    });

    expect(body.items).toEqual(sortedItems);
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
