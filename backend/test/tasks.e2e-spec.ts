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
  ProviderSyncScope,
} from '../src/task-managers/interfaces/task-manager-provider.interface';
import { RepositoryFactory } from './factories/repository.factory';
import { TaskManagerConnectionFactory } from './factories/task-manager-connection.factory';
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

  async listSyncScopes(
    config: TaskManagerConnectionConfig,
  ): Promise<ProviderSyncScope[]> {
    if (config.provider !== 'asana') {
      throw new Error('Invalid provider config for Asana fake provider');
    }

    if (config.projectId) {
      return [
        {
          type: 'asana_project',
          id: config.projectId,
          name: `Project ${config.projectId}`,
          parent: config.workspaceId
            ? {
                type: 'asana_workspace',
                id: config.workspaceId,
                name: `Workspace ${config.workspaceId}`,
              }
            : undefined,
        },
      ];
    }

    if (config.workspaceId) {
      const projectIds = this.listProjectIdsForWorkspace(config.workspaceId);
      if (projectIds.length > 0) {
        return projectIds.map((projectId) => ({
          type: 'asana_project',
          id: projectId,
          name: `Project ${projectId}`,
          parent: {
            type: 'asana_workspace',
            id: config.workspaceId ?? '',
            name: `Workspace ${config.workspaceId}`,
          },
        }));
      }

      return [
        {
          type: 'asana_workspace',
          id: config.workspaceId,
          name: `Workspace ${config.workspaceId}`,
        },
      ];
    }

    const workspaceIds = this.listWorkspaceIds();
    const scopes: ProviderSyncScope[] = [];

    for (const workspaceId of workspaceIds) {
      const projectIds = this.listProjectIdsForWorkspace(workspaceId);
      if (projectIds.length > 0) {
        scopes.push(
          ...projectIds.map((projectId) => ({
            type: 'asana_project' as const,
            id: projectId,
            name: `Project ${projectId}`,
            parent: {
              type: 'asana_workspace' as const,
              id: workspaceId,
              name: `Workspace ${workspaceId}`,
            },
          })),
        );
        continue;
      }

      scopes.push({
        type: 'asana_workspace',
        id: workspaceId,
        name: `Workspace ${workspaceId}`,
      });
    }

    return scopes;
  }

  async fetchTasksForScope(
    config: TaskManagerConnectionConfig,
    scope: ProviderSyncScope,
    limit: number,
    cursor?: string,
  ): Promise<{ tasks: ProviderTask[]; nextCursor: string | null }> {
    if (config.provider !== 'asana') {
      throw new Error('Invalid provider config for Asana fake provider');
    }
    const startAt = this.parseCursor(cursor);

    if (scope.type === 'asana_project') {
      const workspaceId = scope.parent?.id ?? null;
      const matchingFailureKeys = [...this.failuresByScope.keys()].filter(
        (scopeKey) =>
          scopeKey.endsWith(`:${scope.id}`) &&
          (workspaceId === null || scopeKey.startsWith(`${workspaceId}:`)),
      );
      for (const scopeKey of matchingFailureKeys) {
        this.throwFailure(scopeKey);
      }

      const matchingScopeKeys = [...this.tasksByScope.keys()].filter(
        (scopeKey) =>
          scopeKey.endsWith(`:${scope.id}`) &&
          (workspaceId === null || scopeKey.startsWith(`${workspaceId}:`)),
      );
      const tasks = matchingScopeKeys.flatMap(
        (scopeKey) => this.tasksByScope.get(scopeKey) ?? [],
      );
      return this.paginateTasks(tasks, startAt, limit);
    }

    if (scope.type === 'asana_workspace') {
      const matchingFailureKey = [...this.failuresByScope.keys()].find(
        (scopeKey) => scopeKey.startsWith(`${scope.id}:`),
      );
      if (matchingFailureKey) {
        this.throwFailure(matchingFailureKey);
      }

      const tasks = [...this.tasksByScope.entries()]
        .filter(([scopeKey]) => scopeKey.startsWith(`${scope.id}:`))
        .flatMap(([, scopeTasks]) => scopeTasks);

      return this.paginateTasks(tasks, startAt, limit);
    }

    throw new Error('Invalid scope type for Asana fake provider');
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

  private paginateTasks(
    tasks: ProviderTask[],
    startAt: number,
    limit: number,
  ): { tasks: ProviderTask[]; nextCursor: string | null } {
    const sortedTasks = this.sortTasks(tasks);
    const paginatedTasks = sortedTasks.slice(startAt, startAt + limit);
    const nextCursor =
      startAt + paginatedTasks.length < sortedTasks.length
        ? String(startAt + paginatedTasks.length)
        : null;

    return {
      tasks: paginatedTasks,
      nextCursor,
    };
  }

  private listWorkspaceIds(): string[] {
    return [
      ...new Set(
        [...this.tasksByScope.keys(), ...this.failuresByScope.keys()]
          .map((scopeKey) => scopeKey.split(':')[0] ?? '')
          .filter(
            (workspaceId) => workspaceId.length > 0 && workspaceId !== '*',
          ),
      ),
    ];
  }

  private listProjectIdsForWorkspace(workspaceId: string): string[] {
    return [
      ...new Set(
        [...this.tasksByScope.keys(), ...this.failuresByScope.keys()]
          .filter((scopeKey) => scopeKey.startsWith(`${workspaceId}:`))
          .map((scopeKey) => scopeKey.split(':')[1] ?? '')
          .filter((projectId) => projectId.length > 0 && projectId !== '*'),
      ),
    ];
  }

  private parseCursor(cursor: string | undefined): number {
    if (!cursor) {
      return 0;
    }

    const parsedCursor = Number.parseInt(cursor, 10);
    if (!Number.isFinite(parsedCursor) || parsedCursor < 0) {
      return 0;
    }

    return parsedCursor;
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

  async listSyncScopes(
    config: TaskManagerConnectionConfig,
  ): Promise<Array<{ type: 'jira_project'; id: string; name: string }>> {
    if (config.provider !== 'jira') {
      throw new Error('Invalid provider config for Jira fake provider');
    }

    if (config.projectKey) {
      return [
        {
          type: 'jira_project',
          id: config.projectKey,
          name: `Project ${config.projectKey}`,
        },
      ];
    }

    const projectKeys = [...this.tasksByScope.keys()]
      .concat([...this.failuresByScope.keys()])
      .filter((scopeKey) =>
        scopeKey.startsWith(`${config.baseUrl.toLowerCase()}:`),
      )
      .map((scopeKey) => scopeKey.slice(scopeKey.lastIndexOf(':') + 1))
      .filter((projectKey) => projectKey.length > 0 && projectKey !== '*');

    return [...new Set(projectKeys)].map((projectKey) => ({
      type: 'jira_project',
      id: projectKey,
      name: `Project ${projectKey}`,
    }));
  }

  async fetchTasksForScope(
    config: TaskManagerConnectionConfig,
    scope: ProviderSyncScope,
    limit: number,
    cursor?: string,
  ): Promise<{ tasks: ProviderTask[]; nextCursor: string | null }> {
    if (config.provider !== 'jira') {
      throw new Error('Invalid provider config for Jira fake provider');
    }
    if (scope.type !== 'jira_project') {
      throw new Error('Invalid scope type for Jira fake provider');
    }

    const scopeKey = this.buildScopeKey(config.baseUrl, scope.id);
    this.throwFailure(scopeKey);

    const startAt = this.parseCursor(cursor);
    const tasks = this.sortTasks(this.tasksByScope.get(scopeKey) ?? []);
    const paginatedTasks = tasks.slice(startAt, startAt + limit);
    const nextCursor =
      startAt + paginatedTasks.length < tasks.length
        ? String(startAt + paginatedTasks.length)
        : null;

    return {
      tasks: paginatedTasks,
      nextCursor,
    };
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

  private parseCursor(cursor: string | undefined): number {
    if (!cursor) {
      return 0;
    }

    const parsedCursor = Number.parseInt(cursor, 10);
    if (!Number.isFinite(parsedCursor) || parsedCursor < 0) {
      return 0;
    }

    return parsedCursor;
  }
}

describe('Tasks (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let connectionFactory: TaskManagerConnectionFactory;
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
        total: number;
        items: unknown[];
        errors: unknown[];
      }>(),
    ).toEqual({
      repositoryId: null,
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
        title: 'chore/ included without prefix filtering',
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

    const syncRun = await startAndAwaitSync(session);
    expect(syncRun.status).toBe('completed');

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

    expect(body.total).toBe(5);
    expect(body.items.map((item) => item.externalId)).toEqual([
      'A-3',
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

  it('GET /api/tasks should return synced tasks even when one connection sync fails', async () => {
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

    const syncRun = await startAndAwaitSync(session);
    expect(syncRun.status).toBe('failed');

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
    expect(body.errors).toEqual([]);
  });

  it('GET /api/tasks should remain empty when all connection syncs fail', async () => {
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

    const syncRun = await startAndAwaitSync(session);
    expect(syncRun.status).toBe('failed');

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
    expect(body.errors).toEqual([]);
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

    const syncRun = await startAndAwaitSync(session);
    expect(syncRun.status).toBe('completed');

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

  it('POST /api/tasks/sync should return 401 without JWT', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/sync',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/tasks/sync-runs/:id should enforce ownership', async () => {
    const ownerSession = await createLoginSession();
    const attackerSession = await createLoginSession();

    const run = await startAndAwaitSync(ownerSession);
    const response = await app.inject({
      method: 'GET',
      url: `/api/tasks/sync-runs/${run.id}`,
      headers: {
        authorization: `Bearer ${attackerSession.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('GET /api/tasks/scopes should return synced workspace and project options', async () => {
    const session = await createLoginSession();

    const asanaWorkspaceId = faker.string.numeric(8);
    const asanaProjectId = faker.string.numeric(8);
    const jiraBaseUrl = 'https://scopes.atlassian.net';
    const jiraProjectKey = 'SCP';

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
        externalId: 'SCP-A-1',
        title: 'fix/ asana scoped task',
        updatedAt: '2026-03-15T10:00:00.000Z',
      }),
    ]);
    fakeJiraProvider.seedTasks(jiraBaseUrl, jiraProjectKey, [
      buildProviderTask({
        externalId: 'SCP-J-1',
        title: 'feature/ jira scoped task',
        updatedAt: '2026-03-15T09:00:00.000Z',
      }),
    ]);

    const syncRun = await startAndAwaitSync(session);
    expect(syncRun.status).toBe('completed');

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks/scopes',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      asanaWorkspaces: Array<{ id: string; taskCount: number }>;
      asanaProjects: Array<{
        id: string;
        workspaceId: string;
        taskCount: number;
      }>;
      jiraProjects: Array<{ key: string; taskCount: number }>;
    }>();

    expect(body.asanaWorkspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: asanaWorkspaceId,
          taskCount: 1,
        }),
      ]),
    );
    expect(body.jiraProjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: jiraProjectKey,
          taskCount: 1,
        }),
      ]),
    );
    expect(body.asanaProjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: asanaProjectId,
          workspaceId: asanaWorkspaceId,
          taskCount: 1,
        }),
      ]),
    );
  });

  it('GET /api/tasks should apply asanaWorkspaceId, asanaProjectId and jiraProjectKey filters', async () => {
    const session = await createLoginSession();

    const asanaWorkspaceA = faker.string.numeric(8);
    const asanaWorkspaceB = faker.string.numeric(8);
    const asanaProjectA = faker.string.numeric(8);
    const asanaProjectB = faker.string.numeric(8);
    const jiraBaseUrl = 'https://scope-filter.atlassian.net';
    const jiraProjectA = 'SFA';
    const jiraProjectB = 'SFB';

    await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId: asanaWorkspaceA,
      projectId: asanaProjectA,
      scopeKey: `asana:${asanaWorkspaceA}:${asanaProjectA}`,
    });
    await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId: asanaWorkspaceB,
      projectId: asanaProjectB,
      scopeKey: `asana:${asanaWorkspaceB}:${asanaProjectB}`,
    });
    await connectionFactory.create({
      userId: session.userId,
      provider: 'jira',
      baseUrl: jiraBaseUrl,
      projectKey: jiraProjectA,
      scopeKey: `jira:${jiraBaseUrl.toLowerCase()}:${jiraProjectA}`,
      authMode: 'bearer',
    });
    await connectionFactory.create({
      userId: session.userId,
      provider: 'jira',
      baseUrl: jiraBaseUrl,
      projectKey: jiraProjectB,
      scopeKey: `jira:${jiraBaseUrl.toLowerCase()}:${jiraProjectB}`,
      authMode: 'bearer',
    });

    fakeAsanaProvider.seedTasks(asanaWorkspaceA, asanaProjectA, [
      buildProviderTask({
        externalId: 'F-A-1',
        title: 'fix/ workspace A task',
        updatedAt: '2026-03-16T10:00:00.000Z',
      }),
    ]);
    fakeAsanaProvider.seedTasks(asanaWorkspaceB, asanaProjectB, [
      buildProviderTask({
        externalId: 'F-A-2',
        title: 'fix/ workspace B task',
        updatedAt: '2026-03-16T09:00:00.000Z',
      }),
    ]);
    fakeJiraProvider.seedTasks(jiraBaseUrl, jiraProjectA, [
      buildProviderTask({
        externalId: 'F-J-1',
        title: 'feature/ jira project A',
        updatedAt: '2026-03-16T08:00:00.000Z',
      }),
    ]);
    fakeJiraProvider.seedTasks(jiraBaseUrl, jiraProjectB, [
      buildProviderTask({
        externalId: 'F-J-2',
        title: 'feature/ jira project B',
        updatedAt: '2026-03-16T07:00:00.000Z',
      }),
    ]);

    const syncRun = await startAndAwaitSync(session);
    expect(syncRun.status).toBe('completed');

    const asanaFiltered = await app.inject({
      method: 'GET',
      url: `/api/tasks?asanaWorkspaceId=${asanaWorkspaceA}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(asanaFiltered.statusCode).toBe(200);
    expect(
      asanaFiltered
        .json<{ items: Array<{ externalId: string }> }>()
        .items.map((item) => item.externalId),
    ).toEqual(['F-A-1']);

    const asanaProjectFiltered = await app.inject({
      method: 'GET',
      url: `/api/tasks?asanaProjectId=${asanaProjectB}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(asanaProjectFiltered.statusCode).toBe(200);
    expect(
      asanaProjectFiltered
        .json<{ items: Array<{ externalId: string }> }>()
        .items.map((item) => item.externalId),
    ).toEqual(['F-A-2']);

    const asanaCombinedFiltered = await app.inject({
      method: 'GET',
      url: `/api/tasks?asanaWorkspaceId=${asanaWorkspaceA}&asanaProjectId=${asanaProjectA}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(asanaCombinedFiltered.statusCode).toBe(200);
    expect(
      asanaCombinedFiltered
        .json<{ items: Array<{ externalId: string }> }>()
        .items.map((item) => item.externalId),
    ).toEqual(['F-A-1']);

    const jiraFiltered = await app.inject({
      method: 'GET',
      url: `/api/tasks?jiraProjectKey=${jiraProjectA}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(jiraFiltered.statusCode).toBe(200);
    expect(
      jiraFiltered
        .json<{ items: Array<{ externalId: string }> }>()
        .items.map((item) => item.externalId),
    ).toEqual(['F-J-1']);
  });

  it('sync should hard-delete stale tasks removed from provider snapshot', async () => {
    const session = await createLoginSession();
    const workspaceId = faker.string.numeric(8);
    const projectId = faker.string.numeric(8);

    await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId,
      projectId,
      scopeKey: `asana:${workspaceId}:${projectId}`,
    });

    fakeAsanaProvider.seedTasks(workspaceId, projectId, [
      buildProviderTask({
        externalId: 'STALE-1',
        title: 'fix/ initial task',
        updatedAt: '2026-03-16T10:00:00.000Z',
      }),
    ]);

    let run = await startAndAwaitSync(session);
    expect(run.status).toBe('completed');

    let response = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(
      response
        .json<{ items: Array<{ externalId: string }> }>()
        .items.map((item) => item.externalId),
    ).toEqual(['STALE-1']);

    fakeAsanaProvider.seedTasks(workspaceId, projectId, []);
    run = await startAndAwaitSync(session);
    expect(run.status).toBe('completed');

    response = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(response.json<{ items: unknown[] }>().items).toEqual([]);
  });

  it('repository defaults API should drive suggested repository priority (project > workspace > provider)', async () => {
    const session = await createLoginSession();
    const workspaceId = faker.string.numeric(8);
    const projectId = faker.string.numeric(8);

    await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId,
      projectId,
      scopeKey: `asana:${workspaceId}:${projectId}`,
    });

    const providerRepository = await repositoryFactory.create({
      userId: session.userId,
    });
    const workspaceRepository = await repositoryFactory.create({
      userId: session.userId,
    });
    const projectRepository = await repositoryFactory.create({
      userId: session.userId,
    });

    fakeAsanaProvider.seedTasks(workspaceId, projectId, [
      buildProviderTask({
        externalId: 'MAP-1',
        title: 'fix/ task with mapping',
        updatedAt: '2026-03-16T12:00:00.000Z',
      }),
    ]);

    const run = await startAndAwaitSync(session);
    expect(run.status).toBe('completed');

    const setProviderDefault = await app.inject({
      method: 'PUT',
      url: '/api/tasks/repository-defaults',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'asana',
        repositoryId: providerRepository.id,
      },
    });
    expect(setProviderDefault.statusCode).toBe(200);

    let tasksResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(tasksResponse.statusCode).toBe(200);
    expect(
      tasksResponse.json<{
        items: Array<{
          suggestedRepositoryId: string | null;
          repositorySelectionSource: string | null;
        }>;
      }>().items[0],
    ).toEqual(
      expect.objectContaining({
        suggestedRepositoryId: providerRepository.id,
        repositorySelectionSource: 'provider_default',
      }),
    );

    const setWorkspaceDefault = await app.inject({
      method: 'PUT',
      url: '/api/tasks/repository-defaults',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'asana',
        repositoryId: workspaceRepository.id,
        scopeType: 'asana_workspace',
        scopeId: workspaceId,
      },
    });
    expect(setWorkspaceDefault.statusCode).toBe(200);

    tasksResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(tasksResponse.statusCode).toBe(200);
    expect(
      tasksResponse.json<{
        items: Array<{
          suggestedRepositoryId: string | null;
          repositorySelectionSource: string | null;
        }>;
      }>().items[0],
    ).toEqual(
      expect.objectContaining({
        suggestedRepositoryId: workspaceRepository.id,
        repositorySelectionSource: 'asana_workspace',
      }),
    );

    const setProjectDefault = await app.inject({
      method: 'PUT',
      url: '/api/tasks/repository-defaults',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'asana',
        repositoryId: projectRepository.id,
        scopeType: 'asana_project',
        scopeId: projectId,
      },
    });
    expect(setProjectDefault.statusCode).toBe(200);

    tasksResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(tasksResponse.statusCode).toBe(200);
    expect(
      tasksResponse.json<{
        items: Array<{
          suggestedRepositoryId: string | null;
          repositorySelectionSource: string | null;
        }>;
      }>().items[0],
    ).toEqual(
      expect.objectContaining({
        suggestedRepositoryId: projectRepository.id,
        repositorySelectionSource: 'asana_project',
      }),
    );

    const listDefaultsResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks/repository-defaults',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(listDefaultsResponse.statusCode).toBe(200);
    const listedDefaults = listDefaultsResponse.json<{
      items: Array<{
        provider: string;
        scopeType: string | null;
        scopeId: string | null;
        repositoryId: string;
      }>;
    }>();
    expect(listedDefaults.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'asana',
          scopeType: null,
          scopeId: null,
          repositoryId: providerRepository.id,
        }),
        expect.objectContaining({
          provider: 'asana',
          scopeType: 'asana_workspace',
          scopeId: workspaceId,
          repositoryId: workspaceRepository.id,
        }),
        expect.objectContaining({
          provider: 'asana',
          scopeType: 'asana_project',
          scopeId: projectId,
          repositoryId: projectRepository.id,
        }),
      ]),
    );

    const deleteProjectDefault = await app.inject({
      method: 'DELETE',
      url: '/api/tasks/repository-defaults',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'asana',
        scopeType: 'asana_project',
        scopeId: projectId,
      },
    });
    expect(deleteProjectDefault.statusCode).toBe(204);

    tasksResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(tasksResponse.statusCode).toBe(200);
    expect(
      tasksResponse.json<{
        items: Array<{
          suggestedRepositoryId: string | null;
          repositorySelectionSource: string | null;
        }>;
      }>().items[0],
    ).toEqual(
      expect.objectContaining({
        suggestedRepositoryId: workspaceRepository.id,
        repositorySelectionSource: 'asana_workspace',
      }),
    );
  });

  it('repository defaults API should enforce repository ownership', async () => {
    const ownerSession = await createLoginSession();
    const attackerSession = await createLoginSession();
    const foreignRepository = await repositoryFactory.create({
      userId: ownerSession.userId,
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/tasks/repository-defaults',
      headers: {
        authorization: `Bearer ${attackerSession.accessToken}`,
      },
      payload: {
        provider: 'asana',
        repositoryId: foreignRepository.id,
      },
    });

    expect(response.statusCode).toBe(404);
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

  const startAndAwaitSync = async (
    session: LoginSession,
  ): Promise<{
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
  }> => {
    const startResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks/sync',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(startResponse.statusCode).toBe(202);
    const started = startResponse.json<{
      runId: string;
      status: 'queued' | 'running';
    }>();

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const pollResponse = await app.inject({
        method: 'GET',
        url: `/api/tasks/sync-runs/${started.runId}`,
        headers: {
          authorization: `Bearer ${session.accessToken}`,
        },
      });

      expect(pollResponse.statusCode).toBe(200);
      const run = pollResponse.json<{
        id: string;
        status: 'queued' | 'running' | 'completed' | 'failed';
      }>();
      if (run.status === 'completed' || run.status === 'failed') {
        return run;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error('Timed out waiting for task sync completion');
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
