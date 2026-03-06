import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EncryptionService } from '../common/encryption/encryption.service';
import { TaskManagerConnection } from '../task-managers/entities/task-manager-connection.entity';
import { TaskManagerProviderRequestError } from '../task-managers/errors/task-manager-provider.errors';
import { TaskManagerProviderRegistry } from '../task-managers/task-manager-provider.registry';
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
      configService,
    );

    return {
      service,
      connectionRepository,
      encryptionService,
      providerRegistry,
      syncedTaskScopeRepository,
      taskSyncRunRepository,
    };
  };

  it('creates queued run and completes when user has no connections', async () => {
    const { service, connectionRepository, taskSyncRunRepository } =
      createService();

    taskSyncRunRepository.create.mockReturnValue({
      userId: 'user-1',
      status: 'queued',
    } as TaskSyncRun);
    taskSyncRunRepository.save.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
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
    taskSyncRunRepository.findOne.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
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
      status: 'queued',
    } as TaskSyncRun);
    taskSyncRunRepository.save.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
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
    taskSyncRunRepository.findOne.mockResolvedValue({
      id: 'run-1',
      userId: 'user-1',
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
});
