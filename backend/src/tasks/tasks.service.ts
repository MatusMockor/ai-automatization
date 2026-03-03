import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { RepositoriesService } from '../repositories/repositories.service';
import { TaskPrefix } from '../task-managers/entities/task-prefix.entity';
import { TaskFilterService } from '../task-managers/task-filter.service';
import { TaskManagersService } from '../task-managers/task-managers.service';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import { StartTaskSyncResponseDto } from './dto/start-task-sync-response.dto';
import {
  TaskFeedItemDto,
  TaskFeedResponseDto,
} from './dto/task-feed-response.dto';
import { TaskScopesResponseDto } from './dto/task-scopes-response.dto';
import { TaskSyncRunResponseDto } from './dto/task-sync-run-response.dto';
import { SyncedTaskScope } from './entities/synced-task-scope.entity';
import { SyncedTask } from './entities/synced-task.entity';
import { TaskSyncService } from './task-sync.service';

type ScopeFilter = {
  asanaWorkspaceId?: string;
  jiraProjectKey?: string;
};

@Injectable()
export class TasksService {
  private readonly defaultLimit: number;
  private readonly maxLimit: number;

  constructor(
    @InjectRepository(SyncedTask)
    private readonly syncedTaskRepository: Repository<SyncedTask>,
    private readonly taskManagersService: TaskManagersService,
    private readonly taskFilterService: TaskFilterService,
    private readonly taskSyncService: TaskSyncService,
    private readonly repositoriesService: RepositoriesService,
    private readonly configService: ConfigService,
  ) {
    this.defaultLimit = parsePositiveInteger(
      this.configService.get<string>('TASKS_DEFAULT_LIMIT', '100'),
      100,
    );
    this.maxLimit = parsePositiveInteger(
      this.configService.get<string>('TASKS_MAX_LIMIT', '200'),
      200,
    );
  }

  async getTasksForUser(
    userId: string,
    query: GetTasksQueryDto,
  ): Promise<TaskFeedResponseDto> {
    if (query.repoId) {
      await this.repositoriesService.assertOwnedRepository(
        userId,
        query.repoId,
      );
    }

    const connections =
      await this.taskManagersService.listConnectionsForUser(userId);

    const limit = this.resolveLimit(query.limit);
    if (connections.length === 0) {
      return {
        repositoryId: query.repoId ?? null,
        appliedPrefixes: query.prefixes ?? [],
        total: 0,
        items: [],
        errors: [],
      };
    }

    const connectionById = new Map(
      connections.map((connection) => [connection.id, connection]),
    );

    const persistedTasks = await this.syncedTaskRepository.find({
      where: { userId },
      relations: { scopes: true },
      order: {
        sourceUpdatedAt: 'DESC',
        externalId: 'ASC',
      },
    });

    const scopeFilteredTasks = this.filterByScope(persistedTasks, {
      asanaWorkspaceId: query.asanaWorkspaceId,
      jiraProjectKey: query.jiraProjectKey,
    });

    const prefixFilteredItems = this.applyConnectionPrefixes(
      scopeFilteredTasks,
      connectionById,
    );

    const additionalPrefixFilteredItems =
      (query.prefixes?.length ?? 0) > 0
        ? this.filterByAdditionalPrefixes(
            prefixFilteredItems,
            query.prefixes ?? [],
          )
        : prefixFilteredItems;

    const sortedItems = additionalPrefixFilteredItems.sort((a, b) =>
      this.compareItems(a, b),
    );
    const items = sortedItems.slice(0, limit);

    return {
      repositoryId: query.repoId ?? null,
      appliedPrefixes: query.prefixes ?? [],
      total: items.length,
      items,
      errors: [],
    };
  }

  startSyncForUser(userId: string): Promise<StartTaskSyncResponseDto> {
    return this.taskSyncService.startUserSync(userId);
  }

  getSyncRunForUser(
    userId: string,
    runId: string,
  ): Promise<TaskSyncRunResponseDto> {
    return this.taskSyncService.getSyncRunForUser(userId, runId);
  }

  listScopesForUser(userId: string): Promise<TaskScopesResponseDto> {
    return this.taskSyncService.listScopesForUser(userId);
  }

  private filterByScope(
    tasks: SyncedTask[],
    filter: ScopeFilter,
  ): SyncedTask[] {
    const { asanaWorkspaceId, jiraProjectKey } = filter;

    if (!asanaWorkspaceId && !jiraProjectKey) {
      return tasks;
    }

    return tasks.filter((task) => {
      if (task.provider === 'asana') {
        if (!asanaWorkspaceId) {
          return false;
        }

        return task.scopes.some(
          (scope) =>
            scope.scopeType === 'asana_workspace' &&
            scope.scopeId === asanaWorkspaceId,
        );
      }

      if (task.provider === 'jira') {
        if (!jiraProjectKey) {
          return false;
        }

        return task.scopes.some(
          (scope) =>
            scope.scopeType === 'jira_project' &&
            scope.scopeId === jiraProjectKey,
        );
      }

      return false;
    });
  }

  private applyConnectionPrefixes(
    tasks: SyncedTask[],
    connectionById: Map<
      string,
      {
        id: string;
        prefixes: Array<{
          id: string;
          value: string;
          normalizedValue: string;
          createdAt: Date;
        }>;
      }
    >,
  ): TaskFeedItemDto[] {
    const groupedByConnection = new Map<string, SyncedTask[]>();

    for (const task of tasks) {
      if (!connectionById.has(task.connectionId)) {
        continue;
      }

      const existingTasks = groupedByConnection.get(task.connectionId) ?? [];
      existingTasks.push(task);
      groupedByConnection.set(task.connectionId, existingTasks);
    }

    const items: TaskFeedItemDto[] = [];

    for (const [
      connectionId,
      connectionTasks,
    ] of groupedByConnection.entries()) {
      const connection = connectionById.get(connectionId);
      if (!connection) {
        continue;
      }

      const taskByExternalId = new Map(
        connectionTasks.map((task) => [task.externalId, task]),
      );

      const connectionPrefixes: TaskPrefix[] = connection.prefixes.map(
        (prefix) =>
          ({
            id: prefix.id,
            connectionId,
            value: prefix.value,
            normalizedValue: prefix.normalizedValue,
            createdAt: new Date(prefix.createdAt),
          }) as TaskPrefix,
      );

      const filteredTasks = this.taskFilterService.filterTasks(
        connectionTasks.map((task) => ({
          externalId: task.externalId,
          title: task.title,
          description: task.description ?? '',
          url: task.url ?? '',
          status: task.status,
          assignee: task.assignee,
          updatedAt: this.taskUpdatedAt(task),
        })),
        connectionPrefixes,
      );

      for (const filteredTask of filteredTasks) {
        const persistedTask = taskByExternalId.get(filteredTask.externalId);
        if (!persistedTask) {
          continue;
        }

        const primaryScope = this.resolvePrimaryScope(persistedTask.scopes);
        items.push({
          id: `${connectionId}:${persistedTask.provider}:${persistedTask.externalId}`,
          connectionId,
          externalId: persistedTask.externalId,
          title: persistedTask.title,
          description: persistedTask.description ?? '',
          url: persistedTask.url ?? '',
          status: persistedTask.status,
          assignee: persistedTask.assignee,
          source: persistedTask.provider,
          matchedPrefix: filteredTask.matchedPrefix,
          primaryScopeType: primaryScope?.scopeType ?? null,
          primaryScopeId: primaryScope?.scopeId ?? null,
          primaryScopeName: primaryScope?.scopeName ?? null,
          hasMultipleScopes: persistedTask.scopes.length > 1,
          updatedAt: this.taskUpdatedAt(persistedTask),
        });
      }
    }

    return items;
  }

  private resolvePrimaryScope(
    scopes: SyncedTaskScope[],
  ): SyncedTaskScope | null {
    if (scopes.length === 0) {
      return null;
    }

    const explicitPrimary = scopes.find((scope) => scope.isPrimary);
    if (explicitPrimary) {
      return explicitPrimary;
    }

    return [...scopes].sort((a, b) =>
      `${a.scopeType}:${a.scopeId}`.localeCompare(
        `${b.scopeType}:${b.scopeId}`,
      ),
    )[0];
  }

  private filterByAdditionalPrefixes(
    items: TaskFeedItemDto[],
    prefixes: string[],
  ): TaskFeedItemDto[] {
    return items.filter((item) => {
      const normalizedTitle = item.title.trimStart().toLowerCase();
      return prefixes.some((prefix) => normalizedTitle.startsWith(prefix));
    });
  }

  private taskUpdatedAt(
    task: Pick<SyncedTask, 'sourceUpdatedAt' | 'updatedAt'>,
  ): string {
    return (task.sourceUpdatedAt ?? task.updatedAt).toISOString();
  }

  private compareItems(a: TaskFeedItemDto, b: TaskFeedItemDto): number {
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }

    if (a.source !== b.source) {
      return a.source.localeCompare(b.source);
    }

    if (a.externalId !== b.externalId) {
      return a.externalId.localeCompare(b.externalId);
    }

    return a.connectionId.localeCompare(b.connectionId);
  }

  private resolveLimit(limit: number | undefined): number {
    const fallbackLimit = Math.min(this.defaultLimit, this.maxLimit);
    if (limit === undefined) {
      return fallbackLimit;
    }

    if (!Number.isFinite(limit)) {
      return fallbackLimit;
    }

    const normalizedLimit = Math.trunc(limit);
    if (normalizedLimit <= 0) {
      return fallbackLimit;
    }

    return Math.min(normalizedLimit, this.maxLimit);
  }
}
