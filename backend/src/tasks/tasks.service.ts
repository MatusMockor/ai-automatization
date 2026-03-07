import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationRulesService } from '../automation-rules/automation-rules.service';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import { RepositoriesService } from '../repositories/repositories.service';
import { TaskManagersService } from '../task-managers/task-managers.service';
import type { TaskManagerProviderType } from '../task-managers/interfaces/task-manager-provider.interface';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import { StartTaskSyncResponseDto } from './dto/start-task-sync-response.dto';
import { GetTaskSyncRunsQueryDto } from './dto/get-task-sync-runs-query.dto';
import {
  TaskFeedItemDto,
  TaskFeedResponseDto,
} from './dto/task-feed-response.dto';
import { TaskScopesResponseDto } from './dto/task-scopes-response.dto';
import { TaskSyncRunResponseDto } from './dto/task-sync-run-response.dto';
import { DeleteTaskRepositoryDefaultDto } from './dto/delete-task-repository-default.dto';
import {
  TaskRepositoryDefaultItemDto,
  TaskRepositoryDefaultsResponseDto,
} from './dto/task-repository-defaults-response.dto';
import { SyncedTaskScope } from './entities/synced-task-scope.entity';
import { SyncedTask } from './entities/synced-task.entity';
import { TaskRepositoryDefaultsService } from './task-repository-defaults.service';
import { TaskSyncService } from './task-sync.service';
import { UpsertTaskRepositoryDefaultDto } from './dto/upsert-task-repository-default.dto';

type ScopeFilter = {
  provider?: TaskManagerProviderType;
  asanaWorkspaceId?: string;
  asanaProjectId?: string;
  jiraProjectKey?: string;
};

@Injectable()
export class TasksService {
  private readonly defaultLimit: number;
  private readonly maxLimit: number;

  constructor(
    @InjectRepository(SyncedTask)
    private readonly syncedTaskRepository: Repository<SyncedTask>,
    private readonly automationRulesService: AutomationRulesService,
    private readonly taskManagersService: TaskManagersService,
    private readonly taskSyncService: TaskSyncService,
    private readonly taskRepositoryDefaultsService: TaskRepositoryDefaultsService,
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
    this.assertProviderScopeCompatibility(query);

    if (query.repoId) {
      await this.repositoriesService.assertOwnedRepository(
        userId,
        query.repoId,
      );
    }

    const connections =
      await this.taskManagersService.listConnectionsForUser(userId);
    const filteredConnections = query.provider
      ? connections.filter(
          (connection) => connection.provider === query.provider,
        )
      : connections;

    const limit = this.resolveLimit(query.limit);
    if (filteredConnections.length === 0) {
      return {
        repositoryId: query.repoId ?? null,
        total: 0,
        items: [],
        errors: [],
      };
    }

    const connectionById = new Map(
      filteredConnections.map((connection) => [connection.id, connection]),
    );

    const persistedTasks = await this.syncedTaskRepository.find({
      where: query.provider ? { userId, provider: query.provider } : { userId },
      relations: { scopes: true },
      order: {
        sourceUpdatedAt: 'DESC',
        externalId: 'ASC',
      },
    });

    const scopeFilteredTasks = this.filterByScope(persistedTasks, {
      provider: query.provider,
      asanaWorkspaceId: query.asanaWorkspaceId,
      asanaProjectId: query.asanaProjectId,
      jiraProjectKey: query.jiraProjectKey,
    });

    const repositoryDefaultsLookup =
      await this.taskRepositoryDefaultsService.buildLookupForUser(userId);
    const activeRules =
      await this.automationRulesService.listActiveRulesForUser(userId);

    const feedItems = this.buildFeedItems(
      scopeFilteredTasks,
      connectionById,
      repositoryDefaultsLookup,
      activeRules,
    );

    const sortedItems = feedItems.sort((a, b) => this.compareItems(a, b));
    const items = sortedItems.slice(0, limit);

    return {
      repositoryId: query.repoId ?? null,
      total: items.length,
      items,
      errors: [],
    };
  }

  startSyncForUser(
    userId: string,
    provider: TaskManagerProviderType,
  ): Promise<StartTaskSyncResponseDto> {
    return this.taskSyncService.startUserSync(userId, provider);
  }

  getSyncRunForUser(
    userId: string,
    runId: string,
  ): Promise<TaskSyncRunResponseDto> {
    return this.taskSyncService.getSyncRunForUser(userId, runId);
  }

  listSyncRunsForUser(
    userId: string,
    query: GetTaskSyncRunsQueryDto,
  ): Promise<TaskSyncRunResponseDto[]> {
    return this.taskSyncService.listSyncRunsForUser(userId, query);
  }

  listScopesForUser(userId: string): Promise<TaskScopesResponseDto> {
    return this.taskSyncService.listScopesForUser(userId);
  }

  listRepositoryDefaultsForUser(
    userId: string,
  ): Promise<TaskRepositoryDefaultsResponseDto> {
    return this.taskRepositoryDefaultsService.listForUser(userId);
  }

  async upsertRepositoryDefaultForUser(
    userId: string,
    dto: UpsertTaskRepositoryDefaultDto,
  ): Promise<TaskRepositoryDefaultsResponseDto> {
    const item = await this.taskRepositoryDefaultsService.upsertForUser(
      userId,
      dto,
    );

    return this.mapRepositoryDefaultsResponse([item]);
  }

  async deleteRepositoryDefaultForUser(
    userId: string,
    dto: DeleteTaskRepositoryDefaultDto,
  ): Promise<void> {
    await this.taskRepositoryDefaultsService.deleteForUser(userId, dto);
  }

  private filterByScope(
    tasks: SyncedTask[],
    filter: ScopeFilter,
  ): SyncedTask[] {
    const { asanaWorkspaceId, asanaProjectId, jiraProjectKey, provider } =
      filter;

    if (!provider && !asanaWorkspaceId && !asanaProjectId && !jiraProjectKey) {
      return tasks;
    }

    const providerFilteredTasks = provider
      ? tasks.filter((task) => task.provider === provider)
      : tasks;

    return providerFilteredTasks.filter((task) => {
      if (task.provider === 'asana') {
        if (!asanaWorkspaceId && !asanaProjectId) {
          return provider === 'asana';
        }

        const workspaceMatches = !asanaWorkspaceId
          ? true
          : task.scopes.some(
              (scope) =>
                (scope.scopeType === 'asana_workspace' &&
                  scope.scopeId === asanaWorkspaceId) ||
                (scope.scopeType === 'asana_project' &&
                  scope.parentScopeType === 'asana_workspace' &&
                  scope.parentScopeId === asanaWorkspaceId),
            );

        const projectMatches = !asanaProjectId
          ? true
          : task.scopes.some(
              (scope) =>
                scope.scopeType === 'asana_project' &&
                scope.scopeId === asanaProjectId,
            );

        return workspaceMatches && projectMatches;
      }

      if (task.provider === 'jira') {
        if (!jiraProjectKey) {
          return provider === 'jira';
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

  private assertProviderScopeCompatibility(query: GetTasksQueryDto): void {
    if (
      query.provider === 'jira' &&
      (query.asanaWorkspaceId !== undefined ||
        query.asanaProjectId !== undefined)
    ) {
      throw new BadRequestException(
        'Asana scope filters cannot be used with Jira provider filter',
      );
    }

    if (query.provider === 'asana' && query.jiraProjectKey !== undefined) {
      throw new BadRequestException(
        'Jira project filter cannot be used with Asana provider filter',
      );
    }
  }

  private buildFeedItems(
    tasks: SyncedTask[],
    connectionById: Map<string, { id: string }>,
    repositoryDefaultsLookup: Awaited<
      ReturnType<TaskRepositoryDefaultsService['buildLookupForUser']>
    >,
    activeRules: Awaited<
      ReturnType<AutomationRulesService['listActiveRulesForUser']>
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
      if (!connectionById.has(connectionId)) {
        continue;
      }

      for (const persistedTask of connectionTasks) {
        const primaryScope = this.resolvePrimaryScope(persistedTask.scopes);
        const automationMatch = this.automationRulesService.resolveTaskMatch(
          persistedTask,
          activeRules,
        );
        const repositoryDefaultSuggestion =
          this.taskRepositoryDefaultsService.resolveSuggestedRepository(
            persistedTask.provider,
            persistedTask.scopes,
            repositoryDefaultsLookup,
          );

        const suggestedRepositoryId =
          automationMatch?.repositoryId ??
          repositoryDefaultSuggestion.repositoryId;
        const repositorySelectionSource = automationMatch
          ? 'automation_rule'
          : repositoryDefaultSuggestion.source;
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
          primaryScopeType: primaryScope?.scopeType ?? null,
          primaryScopeId: primaryScope?.scopeId ?? null,
          primaryScopeName: primaryScope?.scopeName ?? null,
          suggestedRepositoryId,
          repositorySelectionSource,
          matchedRuleId: automationMatch?.ruleId ?? null,
          matchedRuleName: automationMatch?.ruleName ?? null,
          suggestedAction: automationMatch?.suggestedAction ?? null,
          automationState: automationMatch ? 'matched' : 'none',
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

  private mapRepositoryDefaultsResponse(
    items: TaskRepositoryDefaultItemDto[],
  ): TaskRepositoryDefaultsResponseDto {
    return { items };
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
