import { faker } from '@faker-js/faker';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../src/common/encryption/encryption.service';
import { SyncedTaskScope } from '../src/tasks/entities/synced-task-scope.entity';
import { SyncedTask } from '../src/tasks/entities/synced-task.entity';
import { RepositoryFactory } from './factories/repository.factory';
import { TaskManagerConnectionFactory } from './factories/task-manager-connection.factory';
import { UserFactory } from './factories/user.factory';
import { createTestApp } from './helpers/test-app.factory';

type LoginSession = {
  accessToken: string;
  userId: string;
};

describe('AutomationRules (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let repositoryFactory: RepositoryFactory;
  let connectionFactory: TaskManagerConnectionFactory;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    dataSource = context.dataSource;
    userFactory = new UserFactory(dataSource);
    repositoryFactory = new RepositoryFactory(
      dataSource,
      process.env.REPOSITORIES_BASE_PATH ??
        '/tmp/ai-automation-repositories-test',
    );
    connectionFactory = new TaskManagerConnectionFactory(
      dataSource,
      app.get(EncryptionService),
    );
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/automation-rules should return 401 without JWT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/automation-rules',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should support CRUD for automation rules', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Asana backend fixes',
        provider: 'asana',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        titleContains: ['backend', 'fix'],
        taskStatuses: ['open'],
        repositoryId: repository.id,
        mode: 'draft',
        executionAction: 'fix',
        suggestedAction: 'fix',
        priority: 120,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json<{
      id: string;
      name: string;
      provider: string;
      scopeType: string | null;
      scopeId: string | null;
      titleContains: string[] | null;
      taskStatuses: string[] | null;
      repositoryId: string;
      mode: string;
      executionAction: string | null;
      suggestedAction: string | null;
      priority: number;
    }>();
    expect(created).toEqual(
      expect.objectContaining({
        name: 'Asana backend fixes',
        provider: 'asana',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        titleContains: ['backend', 'fix'],
        taskStatuses: ['open'],
        repositoryId: repository.id,
        mode: 'draft',
        executionAction: 'fix',
        suggestedAction: 'fix',
        priority: 120,
      }),
    );

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Asana backend fixes',
      }),
    ]);

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/automation-rules/${created.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Asana platform fixes',
        enabled: false,
        scopeType: null,
        scopeId: null,
        titleContains: ['platform'],
        taskStatuses: ['in_progress'],
        mode: 'suggest',
        executionAction: 'feature',
        suggestedAction: 'feature',
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual(
      expect.objectContaining({
        id: created.id,
        name: 'Asana platform fixes',
        enabled: false,
        scopeType: null,
        scopeId: null,
        titleContains: ['platform'],
        taskStatuses: ['in_progress'],
        mode: 'suggest',
        executionAction: 'feature',
        suggestedAction: 'feature',
      }),
    );

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/automation-rules/${created.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const listAfterDeleteResponse = await app.inject({
      method: 'GET',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(listAfterDeleteResponse.statusCode).toBe(200);
    expect(listAfterDeleteResponse.json()).toEqual([]);
  });

  it('should reject incompatible provider and scope combinations', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Invalid rule',
        provider: 'jira',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        repositoryId: repository.id,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should support provider-level manual rules and reject manual scopes', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });

    const createManualRuleResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Manual fixes',
        provider: 'manual',
        repositoryId: repository.id,
        mode: 'draft',
        executionAction: 'fix',
        titleContains: ['fix'],
      },
    });

    expect(createManualRuleResponse.statusCode).toBe(201);
    expect(
      createManualRuleResponse.json<{
        provider: string;
        scopeType: string | null;
      }>(),
    ).toEqual(
      expect.objectContaining({
        provider: 'manual',
        scopeType: null,
      }),
    );

    const invalidScopedManualRuleResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Invalid manual scoped rule',
        provider: 'manual',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        repositoryId: repository.id,
      },
    });

    expect(invalidScopedManualRuleResponse.statusCode).toBe(400);
  });

  it('should reject incompatible provider and scope combinations on update', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });

    const createRuleResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Asana scoped rule',
        provider: 'asana',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        repositoryId: repository.id,
      },
    });
    expect(createRuleResponse.statusCode).toBe(201);
    const createdRule = createRuleResponse.json<{ id: string }>();

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/automation-rules/${createdRule.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'manual',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
      },
    });

    expect(updateResponse.statusCode).toBe(400);
  });

  it('should reject malformed array filters instead of normalizing them away', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });

    const nonStringResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Invalid titleContains types',
        provider: 'asana',
        repositoryId: repository.id,
        titleContains: ['backend', 123],
      },
    });
    expect(nonStringResponse.statusCode).toBe(400);

    const emptyStringResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Invalid titleContains empties',
        provider: 'asana',
        repositoryId: repository.id,
        titleContains: ['backend', '   '],
      },
    });
    expect(emptyStringResponse.statusCode).toBe(400);
  });

  it('should reject priority values above the PostgreSQL integer range', async () => {
    const session = await createLoginSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Priority too high',
        provider: 'asana',
        repositoryId: repository.id,
        priority: 2147483648,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should enforce repository ownership', async () => {
    const ownerSession = await createLoginSession();
    const attackerSession = await createLoginSession();
    const foreignRepository = await repositoryFactory.create({
      userId: ownerSession.userId,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${attackerSession.accessToken}`,
      },
      payload: {
        name: 'Foreign repository rule',
        provider: 'asana',
        repositoryId: foreignRepository.id,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('GET /api/tasks should prefer matched automation rule over repository defaults', async () => {
    const session = await createLoginSession();
    const workspaceId = faker.string.numeric(8);
    const projectId = faker.string.numeric(8);
    const connection = await connectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId,
      projectId,
      scopeKey: `asana:${workspaceId}:${projectId}`,
    });

    const defaultRepository = await repositoryFactory.create({
      userId: session.userId,
    });
    const ruleRepository = await repositoryFactory.create({
      userId: session.userId,
    });

    await seedSyncedTask({
      userId: session.userId,
      connectionId: connection.id,
      provider: 'asana',
      externalId: 'TASK-1',
      title: 'Backend fix for automation rule',
      workspaceId,
      projectId,
    });

    const setWorkspaceDefaultResponse = await app.inject({
      method: 'PUT',
      url: '/api/tasks/repository-defaults',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        provider: 'asana',
        repositoryId: defaultRepository.id,
        scopeType: 'asana_workspace',
        scopeId: workspaceId,
      },
    });
    expect(setWorkspaceDefaultResponse.statusCode).toBe(200);

    const createRuleResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-rules',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        name: 'Backend fixes',
        provider: 'asana',
        scopeType: 'asana_project',
        scopeId: projectId,
        titleContains: ['backend', 'fix'],
        taskStatuses: ['open'],
        repositoryId: ruleRepository.id,
        suggestedAction: 'feature',
        priority: 500,
      },
    });
    expect(createRuleResponse.statusCode).toBe(201);
    const createdRule = createRuleResponse.json<{ id: string; name: string }>();

    const tasksResponse = await app.inject({
      method: 'GET',
      url: '/api/tasks?provider=asana',
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
          matchedRuleId: string | null;
          matchedRuleName: string | null;
          suggestedAction: string | null;
          automationState: string;
        }>;
      }>().items[0],
    ).toEqual(
      expect.objectContaining({
        suggestedRepositoryId: ruleRepository.id,
        repositorySelectionSource: 'automation_rule',
        matchedRuleId: createdRule.id,
        matchedRuleName: 'Backend fixes',
        suggestedAction: 'feature',
        automationState: 'matched',
      }),
    );
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

    return {
      accessToken: response.json<{ accessToken: string }>().accessToken,
      userId: user.id,
    };
  };

  const seedSyncedTask = async (input: {
    userId: string;
    connectionId: string;
    provider: 'asana' | 'jira';
    externalId: string;
    title: string;
    workspaceId: string;
    projectId: string;
  }): Promise<void> => {
    const taskRepository = dataSource.getRepository(SyncedTask);
    const scopeRepository = dataSource.getRepository(SyncedTaskScope);

    const task = await taskRepository.save(
      taskRepository.create({
        userId: input.userId,
        connectionId: input.connectionId,
        provider: input.provider,
        externalId: input.externalId,
        title: input.title,
        description: 'Task description',
        url: 'https://app.asana.com/0/123/TASK-1',
        status: 'open',
        assignee: 'Automation User',
        sourceUpdatedAt: new Date('2026-03-18T12:00:00.000Z'),
        lastSyncedAt: new Date('2026-03-18T12:05:00.000Z'),
      }),
    );

    await scopeRepository.save([
      scopeRepository.create({
        taskId: task.id,
        scopeType: 'asana_project',
        scopeId: input.projectId,
        scopeName: `Project ${input.projectId}`,
        parentScopeType: 'asana_workspace',
        parentScopeId: input.workspaceId,
        parentScopeName: `Workspace ${input.workspaceId}`,
        isPrimary: true,
      }),
      scopeRepository.create({
        taskId: task.id,
        scopeType: 'asana_workspace',
        scopeId: input.workspaceId,
        scopeName: `Workspace ${input.workspaceId}`,
        parentScopeType: null,
        parentScopeId: null,
        parentScopeName: null,
        isPrimary: false,
      }),
    ]);
  };
});
