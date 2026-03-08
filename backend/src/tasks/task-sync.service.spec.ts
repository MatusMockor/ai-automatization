import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EncryptionService } from '../common/encryption/encryption.service';
import { TaskManagerConnection } from '../task-managers/entities/task-manager-connection.entity';
import { TaskManagerProviderRequestError } from '../task-managers/errors/task-manager-provider.errors';
import { TaskManagerProviderRegistry } from '../task-managers/task-manager-provider.registry';
import { TaskAutomationOrchestratorService } from './task-automation-orchestrator.service';
import { SyncedTaskScope } from './entities/synced-task-scope.entity';
import { SyncedTask } from './entities/synced-task.entity';
import { TaskSyncRun } from './entities/task-sync-run.entity';
import { TaskSyncService } from './task-sync.service';

describe('TaskSyncService', () => {
  const createService = () => {
    const connectionRepository = {
      find: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<TaskManagerConnection>>;

    const syncedTaskRepository = {
      delete: jest.fn(),
      upsert: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncedTask>>;

    const syncedTaskScopeRepository = {
      createQueryBuilder: jest.fn(),
      delete: jest.fn(),
      insert: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncedTaskScope>>;

    const taskSyncRunRepository = {
      create: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<TaskSyncRun>>;

    const encryptionService = {
      decrypt: jest.fn(),
    } as unknown as jest.Mocked<EncryptionService>;

    const providerRegistry = {
      getProvider: jest.fn(),
    } as unknown as jest.Mocked<TaskManagerProviderRegistry>;

    const taskAutomationOrchestratorService = {
      processSyncedTasks: jest.fn(),
      supersedeDraftsForTaskIds: jest.fn(),
    } as unknown as jest.Mocked<TaskAutomationOrchestratorService>;

    const configService = {
      get: jest.fn((_: string, defaultValue?: string) => defaultValue),
    } as unknown as jest.Mocked<ConfigService>;

    const service = new TaskSyncService(
      connectionRepository,
      syncedTaskRepository,
      syncedTaskScopeRepository,
      taskSyncRunRepository,
      encryptionService,
      providerRegistry,
      taskAutomationOrchestratorService,
      configService,
    );

    return {
      service,
      connectionRepository,
      encryptionService,
      providerRegistry,
      taskAutomationOrchestratorService,
      syncedTaskScopeRepository,
      taskSyncRunRepository,
    };
  };

  it('creates queued run and completes when user has no connections', async () => {
    const { service, connectionRepository, taskSyncRunRepository } =
      createService();

    taskSyncRunRepository.create.mockReturnValue({
      userId: 'user-1',
      provider: 'asana',
      triggerType: 'manual',
      status: 'queued',
    } as TaskSyncRun);
    taskSyncRunRepository.save.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      provider: 'asana',
      triggerType: 'manual',
      status: 'queued',
      connectionsTotal: 0,
      connectionsDone: 0,
      tasksUpserted: 0,
      tasksDeleted: 0,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TaskSyncRun);
    taskSyncRunRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'run-1',
        userId: 'user-1',
        provider: 'asana',
        triggerType: 'manual',
        status: 'queued',
        connectionsTotal: 0,
        connectionsDone: 0,
        tasksUpserted: 0,
        tasksDeleted: 0,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TaskSyncRun);
    connectionRepository.find.mockResolvedValue([]);

    const started = await service.startUserSync('user-1', 'asana');
    expect(started).toEqual({
      runId: 'run-1',
      status: 'queued',
      provider: 'asana',
      triggerType: 'manual',
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(taskSyncRunRepository.update).toHaveBeenCalledWith(
      { id: 'run-1' },
      expect.objectContaining({
        status: 'running',
      }),
    );
    expect(taskSyncRunRepository.update).toHaveBeenCalledWith(
      { id: 'run-1' },
      expect.objectContaining({
        status: 'completed',
      }),
    );
    expect(connectionRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', provider: 'asana' },
      order: { createdAt: 'ASC' },
    });
  });

  it('reuses active run for same user and provider', async () => {
    const { service, taskSyncRunRepository } = createService();
    taskSyncRunRepository.findOne.mockResolvedValue({
      id: 'run-active',
      userId: 'user-1',
      provider: 'jira',
      triggerType: 'schedule',
      status: 'running',
      connectionsTotal: 1,
      connectionsDone: 0,
      tasksUpserted: 0,
      tasksDeleted: 0,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TaskSyncRun);

    const started = await service.startUserSync('user-1', 'jira');

    expect(started).toEqual({
      runId: 'run-active',
      status: 'running',
      provider: 'jira',
      triggerType: 'schedule',
    });
    expect(taskSyncRunRepository.create).not.toHaveBeenCalled();
    expect(taskSyncRunRepository.save).not.toHaveBeenCalled();
  });

  it('hands changed and deleted task ids to the automation orchestrator after a sync run', async () => {
    const {
      service,
      connectionRepository,
      taskAutomationOrchestratorService,
      taskSyncRunRepository,
    } = createService();

    taskSyncRunRepository.findOne.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      provider: 'asana',
      triggerType: 'manual',
      status: 'queued',
      connectionsTotal: 0,
      connectionsDone: 0,
      tasksUpserted: 0,
      tasksDeleted: 0,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TaskSyncRun);
    connectionRepository.find.mockResolvedValue([
      {
        id: 'connection-1',
        userId: 'user-1',
        provider: 'asana',
        createdAt: new Date(),
      } as TaskManagerConnection,
    ]);
    jest.spyOn(service as any, 'syncConnection').mockResolvedValue({
      tasksUpserted: 2,
      tasksDeleted: 1,
      taskIds: ['task-db-1', 'task-db-2'],
      deletedTaskFeedIds: ['connection-1:asana:TASK-3'],
    });

    await (service as any).executeRun('run-1', 'asana');

    expect(
      taskAutomationOrchestratorService.processSyncedTasks,
    ).toHaveBeenCalledWith('user-1', ['task-db-1', 'task-db-2']);
    expect(
      taskAutomationOrchestratorService.supersedeDraftsForTaskIds,
    ).toHaveBeenCalledWith('user-1', ['connection-1:asana:TASK-3']);
  });

  it('lists scopes grouped by provider', async () => {
    const { service, syncedTaskScopeRepository } = createService();

    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          scopeType: 'asana_project',
          scopeId: 'proj-1',
          scopeName: 'Project 1',
          parentScopeType: 'asana_workspace',
          parentScopeId: 'ws-1',
          parentScopeName: 'Workspace 1',
          taskId: 'task-a',
        },
        {
          scopeType: 'asana_project',
          scopeId: 'proj-1',
          scopeName: 'Project 1',
          parentScopeType: 'asana_workspace',
          parentScopeId: 'ws-1',
          parentScopeName: 'Workspace 1',
          taskId: 'task-b',
        },
        {
          scopeType: 'jira_project',
          scopeId: 'BE',
          scopeName: 'Backend',
          parentScopeType: null,
          parentScopeId: null,
          parentScopeName: null,
          taskId: 'task-c',
        },
      ]),
    };

    syncedTaskScopeRepository.createQueryBuilder.mockReturnValue(
      queryBuilder as never,
    );

    const scopes = await service.listScopesForUser('user-1');

    expect(scopes.asanaWorkspaces).toEqual([
      { id: 'ws-1', name: 'Workspace 1', taskCount: 2 },
    ]);
    expect(scopes.asanaProjects).toEqual([
      {
        id: 'proj-1',
        name: 'Project 1',
        workspaceId: 'ws-1',
        workspaceName: 'Workspace 1',
        taskCount: 2,
      },
    ]);
    expect(scopes.jiraProjects).toEqual([
      { key: 'BE', name: 'Backend', taskCount: 1 },
    ]);
  });

  it('throws NotFoundException when sync run does not belong to user', async () => {
    const { service, taskSyncRunRepository } = createService();

    taskSyncRunRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getSyncRunForUser('user-1', 'run-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores detailed Jira sync errors on run and connection state', async () => {
    const {
      service,
      connectionRepository,
      encryptionService,
      providerRegistry,
      taskSyncRunRepository,
    } = createService();

    const provider = {
      listSyncScopes: jest
        .fn()
        .mockResolvedValue([
          { type: 'jira_project', id: 'SCRUM', name: 'Scrum' },
        ]),
      fetchTasksForScope: jest
        .fn()
        .mockRejectedValue(
          new TaskManagerProviderRequestError(
            'Unable to fetch Jira tasks for project SCRUM: Browse projects permission is missing',
            403,
          ),
        ),
    };

    taskSyncRunRepository.create.mockReturnValue({
      userId: 'user-1',
      provider: 'jira',
      triggerType: 'manual',
      status: 'queued',
    } as TaskSyncRun);
    taskSyncRunRepository.save.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
      provider: 'jira',
      triggerType: 'manual',
      status: 'queued',
      connectionsTotal: 0,
      connectionsDone: 0,
      tasksUpserted: 0,
      tasksDeleted: 0,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TaskSyncRun);
    taskSyncRunRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'run-1',
        userId: 'user-1',
        provider: 'jira',
        triggerType: 'manual',
        status: 'queued',
        connectionsTotal: 0,
        connectionsDone: 0,
        tasksUpserted: 0,
        tasksDeleted: 0,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TaskSyncRun);
    connectionRepository.find.mockResolvedValue([
      {
        id: 'connection-1',
        userId: 'user-1',
        provider: 'jira',
        baseUrl: 'https://example.atlassian.net',
        projectKey: 'SCRUM',
        authMode: 'basic',
        emailEncrypted: 'enc-email',
        secretEncrypted: 'enc-secret',
        createdAt: new Date(),
      } as TaskManagerConnection,
    ]);
    encryptionService.decrypt
      .mockReturnValueOnce('jira-token')
      .mockReturnValueOnce('user@example.com');
    providerRegistry.getProvider.mockReturnValue(provider as never);

    await service.startUserSync('user-1', 'jira');
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(connectionRepository.update).toHaveBeenCalledWith(
      { id: 'connection-1' },
      expect.objectContaining({
        lastSyncStatus: 'failed',
        lastSyncError:
          'Unable to fetch Jira tasks for project SCRUM: Browse projects permission is missing',
      }),
    );
    expect(taskSyncRunRepository.update).toHaveBeenCalledWith(
      { id: 'run-1' },
      expect.objectContaining({
        status: 'failed',
        errorMessage:
          '[jira:connection-1] Unable to fetch Jira tasks for project SCRUM: Browse projects permission is missing',
      }),
    );
  });

  it('lists sync runs for user with optional filters', async () => {
    const { service, taskSyncRunRepository } = createService();
    const createdAt = new Date('2026-03-06T10:00:00.000Z');

    taskSyncRunRepository.find.mockResolvedValue([
      {
        id: 'run-1',
        userId: 'user-1',
        provider: 'asana',
        triggerType: 'schedule',
        status: 'completed',
        connectionsTotal: 1,
        connectionsDone: 1,
        tasksUpserted: 5,
        tasksDeleted: 1,
        errorMessage: null,
        startedAt: createdAt,
        finishedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      } as TaskSyncRun,
    ]);

    const runs = await service.listSyncRunsForUser('user-1', {
      provider: 'asana',
      triggerType: 'schedule',
      status: 'completed',
      limit: 5,
    });

    expect(taskSyncRunRepository.find).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        provider: 'asana',
        triggerType: 'schedule',
        status: 'completed',
      },
      order: {
        createdAt: 'DESC',
      },
      take: 5,
    });
    expect(runs).toEqual([
      expect.objectContaining({
        id: 'run-1',
        provider: 'asana',
        triggerType: 'schedule',
        status: 'completed',
      }),
    ]);
  });

  it('skips scheduled sync when interval has not elapsed yet', async () => {
    const { service, taskSyncRunRepository } = createService();
    const now = new Date();

    taskSyncRunRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'run-latest',
        userId: 'user-1',
        provider: 'asana',
        triggerType: 'schedule',
        status: 'completed',
        connectionsTotal: 1,
        connectionsDone: 1,
        tasksUpserted: 5,
        tasksDeleted: 0,
        errorMessage: null,
        startedAt: now,
        finishedAt: now,
        createdAt: now,
        updatedAt: now,
      } as TaskSyncRun);

    const result = await service.startScheduledSyncIfDue('user-1', 'asana', 30);

    expect(result).toBeNull();
    expect(taskSyncRunRepository.create).not.toHaveBeenCalled();
  });
});
