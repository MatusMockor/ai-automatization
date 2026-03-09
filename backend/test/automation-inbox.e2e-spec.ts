import { faker } from '@faker-js/faker';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { AutomationRule } from '../src/automation-rules/entities/automation-rule.entity';
import { EncryptionService } from '../src/common/encryption/encryption.service';
import { Execution } from '../src/executions/entities/execution.entity';
import { ManualTask } from '../src/manual-tasks/entities/manual-task.entity';
import { SyncedTaskScope } from '../src/tasks/entities/synced-task-scope.entity';
import { SyncedTask } from '../src/tasks/entities/synced-task.entity';
import { TaskAutomationControl } from '../src/tasks/entities/task-automation-control.entity';
import {
  buildManualTaskFeedId,
  buildTaskFeedId,
} from '../src/tasks/utils/task-feed-id.utils';
import { ExecutionFactory } from './factories/execution.factory';
import { ManualTaskFactory } from './factories/manual-task.factory';
import { RepositoryFactory } from './factories/repository.factory';
import { TaskManagerConnectionFactory } from './factories/task-manager-connection.factory';
import { UserFactory } from './factories/user.factory';
import { createTestApp } from './helpers/test-app.factory';

type LoginSession = {
  accessToken: string;
  userId: string;
};

describe('Automation Inbox (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let repositoryFactory: RepositoryFactory;
  let manualTaskFactory: ManualTaskFactory;
  let executionFactory: ExecutionFactory;
  let taskManagerConnectionFactory: TaskManagerConnectionFactory;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
    userFactory = new UserFactory(dataSource);
    repositoryFactory = new RepositoryFactory(
      dataSource,
      process.env.REPOSITORIES_BASE_PATH ?? '/tmp/ai-automation-test-repos',
    );
    manualTaskFactory = new ManualTaskFactory(dataSource);
    executionFactory = new ExecutionFactory(dataSource);
    taskManagerConnectionFactory = new TaskManagerConnectionFactory(
      dataSource,
      app.get(EncryptionService),
    );
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    await repositoryFactory.resetWorkspace();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/automation-inbox returns drafted provider and manual work with provider filter support', async () => {
    const session = await createUserSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });
    const manualTask = await manualTaskFactory.create({
      userId: session.userId,
      title: 'Manual API follow-up',
    });
    const connection = await taskManagerConnectionFactory.create({
      userId: session.userId,
      provider: 'asana',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
    });
    const syncedTask = await dataSource.getRepository(SyncedTask).save(
      dataSource.getRepository(SyncedTask).create({
        userId: session.userId,
        connectionId: connection.id,
        provider: 'asana',
        externalId: 'ASANA-1',
        title: 'API integration fix',
        description: 'Investigate broken provider sync',
        url: 'https://app.asana.com/0/1/ASANA-1',
        status: 'open',
        assignee: null,
        sourceUpdatedAt: new Date('2026-03-09T09:00:00.000Z'),
        lastSyncedAt: new Date('2026-03-09T09:00:00.000Z'),
      }),
    );
    await dataSource.getRepository(SyncedTaskScope).save(
      dataSource.getRepository(SyncedTaskScope).create({
        taskId: syncedTask.id,
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        scopeName: 'Project 1',
        parentScopeType: 'asana_workspace',
        parentScopeId: 'ws-1',
        parentScopeName: 'Workspace 1',
        isPrimary: true,
      }),
    );

    const automationRulesRepository = dataSource.getRepository(AutomationRule);
    const manualRule = await automationRulesRepository.save(
      automationRulesRepository.create({
        userId: session.userId,
        name: 'Manual draft rule',
        enabled: true,
        priority: 10,
        provider: 'manual',
        scopeType: null,
        scopeId: null,
        titleContains: ['manual', 'api'],
        taskStatuses: ['open'],
        repositoryId: repository.id,
        mode: 'draft',
        suggestedAction: 'fix',
      }),
    );
    const asanaRule = await automationRulesRepository.save(
      automationRulesRepository.create({
        userId: session.userId,
        name: 'Asana API draft rule',
        enabled: true,
        priority: 10,
        provider: 'asana',
        scopeType: 'asana_project',
        scopeId: 'proj-1',
        titleContains: ['api'],
        taskStatuses: ['open'],
        repositoryId: repository.id,
        mode: 'draft',
        suggestedAction: 'fix',
      }),
    );

    await executionFactory.create({
      userId: session.userId,
      repositoryId: repository.id,
      taskId: buildManualTaskFeedId(manualTask.id),
      taskExternalId: manualTask.id,
      taskTitle: manualTask.title,
      taskDescription: manualTask.description,
      taskSource: 'manual',
      action: 'fix',
      triggerType: 'automation_rule',
      originRuleId: manualRule.id,
      sourceTaskSnapshotUpdatedAt: manualTask.contentUpdatedAt,
      isDraft: true,
      draftStatus: 'ready',
      status: 'pending',
      orchestrationState: 'queued',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      errorMessage: null,
      rootExecutionId: faker.string.uuid(),
    });
    await executionFactory.create({
      userId: session.userId,
      repositoryId: repository.id,
      taskId: buildTaskFeedId({
        connectionId: connection.id,
        provider: 'asana',
        externalId: syncedTask.externalId,
      }),
      taskExternalId: syncedTask.externalId,
      taskTitle: syncedTask.title,
      taskDescription: syncedTask.description,
      taskSource: 'asana',
      action: 'fix',
      triggerType: 'automation_rule',
      originRuleId: asanaRule.id,
      sourceTaskSnapshotUpdatedAt: syncedTask.sourceUpdatedAt,
      isDraft: true,
      draftStatus: 'ready',
      status: 'pending',
      orchestrationState: 'queued',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      errorMessage: null,
      rootExecutionId: faker.string.uuid(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/automation-inbox',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      total: number;
      items: Array<{ source: string; reasonCode: string }>;
    }>();
    expect(body.total).toBe(2);
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'manual',
          reasonCode: 'draft_ready',
        }),
        expect.objectContaining({
          source: 'asana',
          reasonCode: 'draft_ready',
        }),
      ]),
    );

    const manualOnlyResponse = await app.inject({
      method: 'GET',
      url: '/api/automation-inbox?provider=manual',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(manualOnlyResponse.statusCode).toBe(200);
    const manualOnlyBody = manualOnlyResponse.json<{
      total: number;
      items: Array<{ source: string }>;
    }>();
    expect(manualOnlyBody.total).toBe(1);
    expect(manualOnlyBody.items[0]?.source).toBe('manual');
  });

  it('POST /api/automation-inbox/dismiss and /restore should hide and restore inbox items', async () => {
    const session = await createUserSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });
    const manualTask = await manualTaskFactory.create({
      userId: session.userId,
      title: 'Manual fix me',
    });
    const rule = await dataSource.getRepository(AutomationRule).save(
      dataSource.getRepository(AutomationRule).create({
        userId: session.userId,
        name: 'Manual draft rule',
        enabled: true,
        priority: 10,
        provider: 'manual',
        scopeType: null,
        scopeId: null,
        titleContains: ['manual'],
        taskStatuses: ['open'],
        repositoryId: repository.id,
        mode: 'draft',
        suggestedAction: 'fix',
      }),
    );
    await executionFactory.create({
      userId: session.userId,
      repositoryId: repository.id,
      taskId: buildManualTaskFeedId(manualTask.id),
      taskExternalId: manualTask.id,
      taskTitle: manualTask.title,
      taskDescription: manualTask.description,
      taskSource: 'manual',
      action: 'fix',
      triggerType: 'automation_rule',
      originRuleId: rule.id,
      sourceTaskSnapshotUpdatedAt: manualTask.contentUpdatedAt,
      isDraft: true,
      draftStatus: 'ready',
      status: 'pending',
      orchestrationState: 'queued',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      errorMessage: null,
      rootExecutionId: faker.string.uuid(),
    });

    const taskKey = buildManualTaskFeedId(manualTask.id);

    const dismissResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-inbox/dismiss',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: { taskKey },
    });
    expect(dismissResponse.statusCode).toBe(204);

    const hiddenResponse = await app.inject({
      method: 'GET',
      url: '/api/automation-inbox',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(hiddenResponse.statusCode).toBe(200);
    expect(hiddenResponse.json<{ total: number }>().total).toBe(0);

    const suppressedResponse = await app.inject({
      method: 'GET',
      url: '/api/automation-inbox?includeSuppressed=true',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(suppressedResponse.statusCode).toBe(200);
    expect(
      suppressedResponse.json<{ items: Array<{ reasonCode: string }> }>().items,
    ).toEqual([
      expect.objectContaining({
        reasonCode: 'dismissed_until_change',
      }),
    ]);

    const restoreResponse = await app.inject({
      method: 'POST',
      url: '/api/automation-inbox/restore',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: { taskKey },
    });
    expect(restoreResponse.statusCode).toBe(204);

    const restoredResponse = await app.inject({
      method: 'GET',
      url: '/api/automation-inbox',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });
    expect(restoredResponse.statusCode).toBe(200);
    expect(restoredResponse.json<{ total: number }>().total).toBe(1);
  });

  it('GET /api/automation-inbox/:taskKey/history returns derived rule, draft, and control history', async () => {
    const session = await createUserSession();
    const repository = await repositoryFactory.create({
      userId: session.userId,
    });
    const manualTask = await manualTaskFactory.create({
      userId: session.userId,
      title: 'Manual inbox history task',
    });
    const rule = await dataSource.getRepository(AutomationRule).save(
      dataSource.getRepository(AutomationRule).create({
        userId: session.userId,
        name: 'History rule',
        enabled: true,
        priority: 5,
        provider: 'manual',
        scopeType: null,
        scopeId: null,
        titleContains: ['history'],
        taskStatuses: ['open'],
        repositoryId: repository.id,
        mode: 'draft',
        suggestedAction: 'fix',
      }),
    );
    await executionFactory.create({
      userId: session.userId,
      repositoryId: repository.id,
      taskId: buildManualTaskFeedId(manualTask.id),
      taskExternalId: manualTask.id,
      taskTitle: manualTask.title,
      taskDescription: manualTask.description,
      taskSource: 'manual',
      action: 'fix',
      triggerType: 'automation_rule',
      originRuleId: rule.id,
      sourceTaskSnapshotUpdatedAt: manualTask.contentUpdatedAt,
      isDraft: true,
      draftStatus: 'ready',
      status: 'pending',
      orchestrationState: 'queued',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      errorMessage: null,
      rootExecutionId: faker.string.uuid(),
    });
    await dataSource.getRepository(TaskAutomationControl).save(
      dataSource.getRepository(TaskAutomationControl).create({
        userId: session.userId,
        taskKey: buildManualTaskFeedId(manualTask.id),
        controlType: 'dismiss_until_change',
        untilAt: null,
        sourceVersion: manualTask.contentUpdatedAt.toISOString(),
        isActive: true,
        restoredAt: null,
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/automation-inbox/${encodeURIComponent(buildManualTaskFeedId(manualTask.id))}/history`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: Array<{ type: string }> }>();
    expect(body.items.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'rule_matched',
        'draft_created',
        'task_dismissed',
      ]),
    );
  });

  async function createUserSession(): Promise<LoginSession> {
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
  }
});
