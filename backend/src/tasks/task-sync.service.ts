import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { EncryptionService } from '../common/encryption/encryption.service';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { TaskManagerConnection } from '../task-managers/entities/task-manager-connection.entity';
import { TaskManagerProviderNotFoundError } from '../task-managers/errors/task-manager-provider.errors';
import {
  TaskManagerConnectionConfig,
  TaskManagerProvider,
  TaskManagerProviderType,
  ProviderSyncScope,
  ProviderSyncScopeType,
  ProviderTask,
} from '../task-managers/interfaces/task-manager-provider.interface';
import { TaskManagerProviderRegistry } from '../task-managers/task-manager-provider.registry';
import { StartTaskSyncResponseDto } from './dto/start-task-sync-response.dto';
import { TaskScopesResponseDto } from './dto/task-scopes-response.dto';
import { TaskSyncRunResponseDto } from './dto/task-sync-run-response.dto';
import {
  SyncedTaskScope,
  SyncedTaskScopeType,
} from './entities/synced-task-scope.entity';
import { SyncedTask } from './entities/synced-task.entity';
import { TaskSyncRun } from './entities/task-sync-run.entity';

type AggregatedTask = {
  task: ProviderTask;
  scopes: Map<
    string,
    {
      type: SyncedTaskScopeType;
      id: string;
      name: string;
      parent?: {
        type: 'asana_workspace' | 'jira_project';
        id: string;
        name: string;
      };
    }
  >;
};

@Injectable()
export class TaskSyncService {
  private readonly logger = new Logger(TaskSyncService.name);
  private readonly pageLimit: number;
  private readonly maxPagesPerScope: number;

  constructor(
    @InjectRepository(TaskManagerConnection)
    private readonly connectionRepository: Repository<TaskManagerConnection>,
    @InjectRepository(SyncedTask)
    private readonly syncedTaskRepository: Repository<SyncedTask>,
    @InjectRepository(SyncedTaskScope)
    private readonly syncedTaskScopeRepository: Repository<SyncedTaskScope>,
    @InjectRepository(TaskSyncRun)
    private readonly taskSyncRunRepository: Repository<TaskSyncRun>,
    private readonly encryptionService: EncryptionService,
    private readonly providerRegistry: TaskManagerProviderRegistry,
    private readonly configService: ConfigService,
  ) {
    this.pageLimit = parsePositiveInteger(
      this.configService.get<string>('TASK_SYNC_PAGE_LIMIT', '100'),
      100,
    );
    this.maxPagesPerScope = parsePositiveInteger(
      this.configService.get<string>('TASK_SYNC_MAX_PAGES_PER_SCOPE', '100'),
      100,
    );
  }

  async startUserSync(
    userId: string,
    provider: TaskManagerProviderType,
  ): Promise<StartTaskSyncResponseDto> {
    const run = await this.taskSyncRunRepository.save(
      this.taskSyncRunRepository.create({
        userId,
        status: 'queued',
        connectionsTotal: 0,
        connectionsDone: 0,
        tasksUpserted: 0,
        tasksDeleted: 0,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      }),
    );

    setImmediate(() => {
      void this.executeRun(run.id, provider).catch((error) => {
        this.logger.error(
          `Task sync run ${run.id} crashed unexpectedly`,
          error instanceof Error ? error.stack : undefined,
        );
      });
    });

    return {
      runId: run.id,
      status: 'queued',
    };
  }

  async getSyncRunForUser(
    userId: string,
    runId: string,
  ): Promise<TaskSyncRunResponseDto> {
    const run = await this.taskSyncRunRepository.findOne({
      where: { id: runId, userId },
    });

    if (!run) {
      throw new NotFoundException('Task sync run not found');
    }

    return this.mapRun(run);
  }

  async listScopesForUser(userId: string): Promise<TaskScopesResponseDto> {
    const rawScopeRows = await this.syncedTaskScopeRepository
      .createQueryBuilder('scope')
      .innerJoin('scope.task', 'task')
      .select('scope.scopeType', 'scopeType')
      .addSelect('scope.scopeId', 'scopeId')
      .addSelect('scope.scopeName', 'scopeName')
      .addSelect('scope.parentScopeType', 'parentScopeType')
      .addSelect('scope.parentScopeId', 'parentScopeId')
      .addSelect('scope.parentScopeName', 'parentScopeName')
      .addSelect('task.id', 'taskId')
      .where('task.userId = :userId', { userId })
      .getRawMany<{
        scopeType: SyncedTaskScopeType;
        scopeId: string;
        scopeName: string;
        parentScopeType: 'asana_workspace' | 'jira_project' | null;
        parentScopeId: string | null;
        parentScopeName: string | null;
        taskId: string;
      }>();

    const workspaceTaskIds = new Map<
      string,
      {
        name: string;
        taskIds: Set<string>;
      }
    >();
    const projectTaskIds = new Map<
      string,
      {
        name: string;
        workspaceId: string;
        workspaceName: string;
        taskIds: Set<string>;
      }
    >();
    const jiraTaskIds = new Map<
      string,
      {
        name: string;
        taskIds: Set<string>;
      }
    >();

    for (const row of rawScopeRows) {
      if (row.scopeType === 'asana_workspace') {
        const existing = workspaceTaskIds.get(row.scopeId) ?? {
          name: row.scopeName,
          taskIds: new Set<string>(),
        };
        existing.taskIds.add(row.taskId);
        workspaceTaskIds.set(row.scopeId, existing);
        continue;
      }

      if (row.scopeType === 'asana_project') {
        if (
          row.parentScopeType === 'asana_workspace' &&
          row.parentScopeId &&
          row.parentScopeName
        ) {
          const workspace = workspaceTaskIds.get(row.parentScopeId) ?? {
            name: row.parentScopeName,
            taskIds: new Set<string>(),
          };
          workspace.taskIds.add(row.taskId);
          workspaceTaskIds.set(row.parentScopeId, workspace);

          const project = projectTaskIds.get(row.scopeId) ?? {
            name: row.scopeName,
            workspaceId: row.parentScopeId,
            workspaceName: row.parentScopeName,
            taskIds: new Set<string>(),
          };
          project.taskIds.add(row.taskId);
          projectTaskIds.set(row.scopeId, project);
        }
        continue;
      }

      if (row.scopeType === 'jira_project') {
        const existing = jiraTaskIds.get(row.scopeId) ?? {
          name: row.scopeName,
          taskIds: new Set<string>(),
        };
        existing.taskIds.add(row.taskId);
        jiraTaskIds.set(row.scopeId, existing);
      }
    }

    const asanaWorkspaces = [...workspaceTaskIds.entries()]
      .map(([id, workspace]) => ({
        id,
        name: workspace.name,
        taskCount: workspace.taskIds.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const asanaProjects = [...projectTaskIds.entries()]
      .map(([id, project]) => ({
        id,
        name: project.name,
        workspaceId: project.workspaceId,
        workspaceName: project.workspaceName,
        taskCount: project.taskIds.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const jiraProjects = [...jiraTaskIds.entries()]
      .map(([key, project]) => ({
        key,
        name: project.name,
        taskCount: project.taskIds.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      asanaWorkspaces,
      asanaProjects,
      jiraProjects,
    };
  }

  private async executeRun(
    runId: string,
    provider: TaskManagerProviderType,
  ): Promise<void> {
    const run = await this.taskSyncRunRepository.findOne({
      where: { id: runId },
    });
    if (!run) {
      return;
    }

    await this.taskSyncRunRepository.update(
      { id: run.id },
      {
        status: 'running',
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    );

    try {
      const connections = await this.connectionRepository.find({
        where: { userId: run.userId, provider },
        order: { createdAt: 'ASC' },
      });

      await this.taskSyncRunRepository.update(
        { id: run.id },
        {
          connectionsTotal: connections.length,
        },
      );

      if (connections.length === 0) {
        await this.taskSyncRunRepository.update(
          { id: run.id },
          {
            status: 'completed',
            finishedAt: new Date(),
          },
        );
        return;
      }

      let tasksUpserted = 0;
      let tasksDeleted = 0;
      let connectionsDone = 0;
      const connectionErrors: string[] = [];

      for (const connection of connections) {
        try {
          const synced = await this.syncConnection(connection);
          tasksUpserted += synced.tasksUpserted;
          tasksDeleted += synced.tasksDeleted;

          await this.connectionRepository.update(
            { id: connection.id },
            {
              lastSyncedAt: new Date(),
              lastSyncStatus: 'completed',
              lastSyncError: null,
            },
          );
        } catch (error) {
          const connectionError = this.describeError(error);
          connectionErrors.push(
            `[${connection.provider}:${connection.id}] ${connectionError}`,
          );

          await this.connectionRepository.update(
            { id: connection.id },
            {
              lastSyncedAt: new Date(),
              lastSyncStatus: 'failed',
              lastSyncError: connectionError,
            },
          );
        } finally {
          connectionsDone += 1;
          await this.taskSyncRunRepository.update(
            { id: run.id },
            {
              connectionsDone,
              tasksUpserted,
              tasksDeleted,
            },
          );
        }
      }

      await this.taskSyncRunRepository.update(
        { id: run.id },
        {
          status: connectionErrors.length > 0 ? 'failed' : 'completed',
          errorMessage:
            connectionErrors.length > 0
              ? connectionErrors.join('\n').slice(0, 4000)
              : null,
          finishedAt: new Date(),
          connectionsDone,
          tasksUpserted,
          tasksDeleted,
        },
      );
    } catch (error) {
      await this.taskSyncRunRepository.update(
        { id: run.id },
        {
          status: 'failed',
          errorMessage: this.describeError(error),
          finishedAt: new Date(),
        },
      );
    }
  }

  private async syncConnection(
    connection: TaskManagerConnection,
  ): Promise<{ tasksUpserted: number; tasksDeleted: number }> {
    const config = this.toConnectionConfig(connection);
    const providerType = this.toProviderType(connection.provider);
    const provider = this.providerRegistry.getProvider(providerType);

    const scopes = await provider.listSyncScopes(config);
    const tasksByExternalId = await this.collectTasksAcrossScopes(
      provider,
      config,
      scopes,
    );
    const now = new Date();

    if (tasksByExternalId.size === 0) {
      const deleted = await this.syncedTaskRepository.manager.transaction(
        async (manager) =>
          this.deleteAllTasksForConnection(
            manager.getRepository(SyncedTask),
            connection.id,
          ),
      );

      return {
        tasksUpserted: 0,
        tasksDeleted: deleted,
      };
    }

    const upsertRows = Array.from(tasksByExternalId.entries()).map(
      ([externalId, aggregate]) => ({
        userId: connection.userId,
        connectionId: connection.id,
        provider: providerType,
        externalId,
        title: aggregate.task.title,
        description: aggregate.task.description || null,
        url: aggregate.task.url || null,
        status: aggregate.task.status,
        assignee: aggregate.task.assignee,
        sourceUpdatedAt: this.parseTimestamp(aggregate.task.updatedAt),
        lastSyncedAt: now,
      }),
    );

    const externalIds = upsertRows.map((row) => row.externalId);
    const deleted = await this.syncedTaskRepository.manager.transaction(
      async (manager) =>
        this.persistConnectionSnapshot(
          manager,
          connection.id,
          now,
          upsertRows,
          externalIds,
          tasksByExternalId,
        ),
    );

    return {
      tasksUpserted: upsertRows.length,
      tasksDeleted: deleted,
    };
  }

  private async collectTasksAcrossScopes(
    provider: TaskManagerProvider,
    config: TaskManagerConnectionConfig,
    scopes: ProviderSyncScope[],
  ): Promise<Map<string, AggregatedTask>> {
    const tasksByExternalId = new Map<string, AggregatedTask>();

    for (const scope of scopes) {
      let cursor: string | undefined;
      let pageCount = 0;

      while (pageCount < this.maxPagesPerScope) {
        let page:
          | {
              tasks: ProviderTask[];
              nextCursor: string | null;
            }
          | undefined;
        try {
          page = await provider.fetchTasksForScope(
            config,
            scope,
            this.pageLimit,
            cursor,
          );
        } catch (error) {
          if (error instanceof TaskManagerProviderNotFoundError) {
            this.logger.warn(
              `Skipping missing provider scope ${scope.type}:${scope.id}`,
            );
            break;
          }

          throw error;
        }

        if (!page) {
          break;
        }

        for (const task of page.tasks) {
          this.mergeAggregatedTask(tasksByExternalId, task, scope);
        }

        if (!page.nextCursor) {
          break;
        }

        cursor = page.nextCursor;
        pageCount += 1;
      }

      if (pageCount >= this.maxPagesPerScope && cursor) {
        throw new Error(
          `Scope ${scope.type}:${scope.id} exceeded page limit ${this.maxPagesPerScope}`,
        );
      }
    }

    return tasksByExternalId;
  }

  private mergeAggregatedTask(
    tasksByExternalId: Map<string, AggregatedTask>,
    task: ProviderTask,
    scope: ProviderSyncScope,
  ): void {
    if (!task.externalId) {
      return;
    }

    const normalizedScope = this.toSyncedScope(scope);
    const scopeKey = `${normalizedScope.type}:${normalizedScope.id}`;
    const existing = tasksByExternalId.get(task.externalId);

    if (!existing) {
      tasksByExternalId.set(task.externalId, {
        task,
        scopes: new Map([[scopeKey, normalizedScope]]),
      });
      return;
    }

    const existingTimestamp = Date.parse(existing.task.updatedAt);
    const nextTimestamp = Date.parse(task.updatedAt);
    if (
      Number.isFinite(nextTimestamp) &&
      (!Number.isFinite(existingTimestamp) || nextTimestamp > existingTimestamp)
    ) {
      existing.task = task;
    }

    existing.scopes.set(scopeKey, normalizedScope);
  }

  private async persistConnectionSnapshot(
    manager: EntityManager,
    connectionId: string,
    syncTimestamp: Date,
    upsertRows: Array<
      Pick<
        SyncedTask,
        | 'userId'
        | 'connectionId'
        | 'provider'
        | 'externalId'
        | 'title'
        | 'description'
        | 'url'
        | 'status'
        | 'assignee'
        | 'sourceUpdatedAt'
        | 'lastSyncedAt'
      >
    >,
    externalIds: string[],
    tasksByExternalId: Map<string, AggregatedTask>,
  ): Promise<number> {
    const syncedTaskRepository = manager.getRepository(SyncedTask);
    const syncedTaskScopeRepository = manager.getRepository(SyncedTaskScope);

    await this.bulkUpsertSyncedTasks(syncedTaskRepository, upsertRows);

    const persistedTasks = await this.findPersistedTasks(
      syncedTaskRepository,
      connectionId,
      externalIds,
    );

    await this.replaceTaskScopes(
      syncedTaskScopeRepository,
      persistedTasks,
      tasksByExternalId,
    );

    return this.deleteStaleTasks(
      syncedTaskRepository,
      connectionId,
      syncTimestamp,
    );
  }

  private async bulkUpsertSyncedTasks(
    syncedTaskRepository: Repository<SyncedTask>,
    rows: Array<
      Pick<
        SyncedTask,
        | 'userId'
        | 'connectionId'
        | 'provider'
        | 'externalId'
        | 'title'
        | 'description'
        | 'url'
        | 'status'
        | 'assignee'
        | 'sourceUpdatedAt'
        | 'lastSyncedAt'
      >
    >,
  ): Promise<void> {
    const chunkSize = 250;

    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);
      await syncedTaskRepository.upsert(chunk, ['connectionId', 'externalId']);
    }
  }

  private async findPersistedTasks(
    syncedTaskRepository: Repository<SyncedTask>,
    connectionId: string,
    externalIds: string[],
  ): Promise<Array<Pick<SyncedTask, 'id' | 'externalId'>>> {
    const chunkSize = 200;
    const tasks: Array<Pick<SyncedTask, 'id' | 'externalId'>> = [];

    for (let index = 0; index < externalIds.length; index += chunkSize) {
      const chunk = externalIds.slice(index, index + chunkSize);
      const found = await syncedTaskRepository.find({
        where: {
          connectionId,
          externalId: In(chunk),
        },
        select: {
          id: true,
          externalId: true,
        },
      });
      tasks.push(...found);
    }

    return tasks;
  }

  private async replaceTaskScopes(
    syncedTaskScopeRepository: Repository<SyncedTaskScope>,
    persistedTasks: Array<Pick<SyncedTask, 'id' | 'externalId'>>,
    tasksByExternalId: Map<string, AggregatedTask>,
  ): Promise<void> {
    if (persistedTasks.length === 0) {
      return;
    }

    const taskIds = persistedTasks.map((task) => task.id);
    await syncedTaskScopeRepository.delete({ taskId: In(taskIds) });

    const scopeRows: Array<
      Pick<
        SyncedTaskScope,
        | 'taskId'
        | 'scopeType'
        | 'scopeId'
        | 'scopeName'
        | 'parentScopeType'
        | 'parentScopeId'
        | 'parentScopeName'
        | 'isPrimary'
      >
    > = [];

    for (const persistedTask of persistedTasks) {
      const aggregate = tasksByExternalId.get(persistedTask.externalId);
      if (!aggregate) {
        continue;
      }

      const scopes = Array.from(aggregate.scopes.values()).sort((a, b) =>
        `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`),
      );

      scopes.forEach((scope, index) => {
        scopeRows.push({
          taskId: persistedTask.id,
          scopeType: scope.type,
          scopeId: scope.id,
          scopeName: scope.name,
          parentScopeType: scope.parent?.type ?? null,
          parentScopeId: scope.parent?.id ?? null,
          parentScopeName: scope.parent?.name ?? null,
          isPrimary: index === 0,
        });
      });
    }

    if (scopeRows.length === 0) {
      return;
    }

    const chunkSize = 500;
    for (let index = 0; index < scopeRows.length; index += chunkSize) {
      await syncedTaskScopeRepository.insert(
        scopeRows.slice(index, index + chunkSize),
      );
    }
  }

  private async deleteAllTasksForConnection(
    syncedTaskRepository: Repository<SyncedTask>,
    connectionId: string,
  ): Promise<number> {
    const result = await syncedTaskRepository.delete({ connectionId });
    return result.affected ?? 0;
  }

  private async deleteStaleTasks(
    syncedTaskRepository: Repository<SyncedTask>,
    connectionId: string,
    syncTimestamp: Date,
  ): Promise<number> {
    const result = await syncedTaskRepository
      .createQueryBuilder()
      .delete()
      .where('"connection_id" = :connectionId', { connectionId })
      .andWhere('"last_synced_at" < :syncTimestamp', { syncTimestamp })
      .execute();

    return result.affected ?? 0;
  }

  private toConnectionConfig(
    connection: TaskManagerConnection,
  ): TaskManagerConnectionConfig {
    const provider = this.toProviderType(connection.provider);
    const secret = this.encryptionService.decrypt(connection.secretEncrypted);

    if (provider === 'asana') {
      return {
        provider: 'asana',
        personalAccessToken: secret,
        workspaceId: connection.workspaceId,
        projectId: connection.projectId,
      };
    }

    if (connection.authMode === 'basic') {
      if (!connection.baseUrl || !connection.emailEncrypted) {
        throw new Error('Stored Jira connection is invalid and cannot be used');
      }

      return {
        provider: 'jira',
        baseUrl: connection.baseUrl,
        projectKey: connection.projectKey,
        authMode: 'basic',
        email: this.encryptionService.decrypt(connection.emailEncrypted),
        apiToken: secret,
      };
    }

    if (connection.authMode === 'bearer') {
      if (!connection.baseUrl) {
        throw new Error('Stored Jira connection is invalid and cannot be used');
      }

      return {
        provider: 'jira',
        baseUrl: connection.baseUrl,
        projectKey: connection.projectKey,
        authMode: 'bearer',
        accessToken: secret,
      };
    }

    throw new Error('Stored Jira connection authentication mode is invalid');
  }

  private toProviderType(provider: string): TaskManagerProviderType {
    if (provider === 'asana' || provider === 'jira') {
      return provider;
    }

    throw new Error(`Unsupported task manager provider: ${provider}`);
  }

  private toSyncedScope(scope: ProviderSyncScope): {
    type: SyncedTaskScopeType;
    id: string;
    name: string;
    parent?: {
      type: 'asana_workspace' | 'jira_project';
      id: string;
      name: string;
    };
  } {
    const scopeTypeMap: Record<ProviderSyncScopeType, SyncedTaskScopeType> = {
      asana_workspace: 'asana_workspace',
      asana_project: 'asana_project',
      jira_project: 'jira_project',
    };

    return {
      type: scopeTypeMap[scope.type],
      id: scope.id,
      name: scope.name,
      parent:
        scope.parent === undefined
          ? undefined
          : {
              type: scope.parent.type,
              id: scope.parent.id,
              name: scope.parent.name,
            },
    };
  }

  private parseTimestamp(value: string): Date | null {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      return null;
    }

    return timestamp;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Task sync failed due to an unknown error';
  }

  private mapRun(run: TaskSyncRun): TaskSyncRunResponseDto {
    return {
      id: run.id,
      status: run.status,
      connectionsTotal: run.connectionsTotal,
      connectionsDone: run.connectionsDone,
      tasksUpserted: run.tasksUpserted,
      tasksDeleted: run.tasksDeleted,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }
}
