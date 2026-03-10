import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationRulesService } from '../automation-rules/automation-rules.service';
import { parsePositiveInteger } from '../common/utils/parse.utils';
import {
  ExecutionDraftLookupItem,
  ExecutionsService,
} from '../executions/executions.service';
import type {
  ExecutionDraftStatus,
  TaskAutomationState,
  TaskSource,
} from '../executions/interfaces/execution.types';
import { ManualTask } from '../manual-tasks/entities/manual-task.entity';
import { mapManualWorkflowStateToTaskStatus } from '../manual-tasks/utils/manual-task-status.utils';
import { RepositoriesService } from '../repositories/repositories.service';
import type { TaskManagerProviderType } from '../task-managers/interfaces/task-manager-provider.interface';
import { TaskManagersService } from '../task-managers/task-managers.service';
import { DeleteTaskRepositoryDefaultDto } from './dto/delete-task-repository-default.dto';
import { GetTaskSyncRunsQueryDto } from './dto/get-task-sync-runs-query.dto';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import { StartTaskSyncResponseDto } from './dto/start-task-sync-response.dto';
import {
  TaskFeedItemDto,
  TaskFeedResponseDto,
} from './dto/task-feed-response.dto';
import {
  TaskRepositoryDefaultItemDto,
  TaskRepositoryDefaultsResponseDto,
} from './dto/task-repository-defaults-response.dto';
import { TaskScopesResponseDto } from './dto/task-scopes-response.dto';
import { TaskSyncRunResponseDto } from './dto/task-sync-run-response.dto';
import { UpsertTaskRepositoryDefaultDto } from './dto/upsert-task-repository-default.dto';
import { SyncedTaskScope } from './entities/synced-task-scope.entity';
import { SyncedTask } from './entities/synced-task.entity';
import { TaskRepositoryDefaultsService } from './task-repository-defaults.service';
import { TaskSyncService } from './task-sync.service';
import { ResolvedTaskFeedItem } from './task-feed.types';
import {
  buildManualTaskFeedId,
  buildTaskFeedId,
  extractManualTaskId,
  extractTaskFeedIdentity,
} from './utils/task-feed-id.utils';
import {
  resolveManualTaskSnapshotVersion,
  resolveTaskSnapshotVersion,
} from './utils/task-snapshot-version.utils';

type ScopeFilter = {
  provider?: TaskSource;
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
    @InjectRepository(ManualTask)
    private readonly manualTaskRepository: Repository<ManualTask>,
    private readonly automationRulesService: AutomationRulesService,
    private readonly executionsService: ExecutionsService,
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
    const feedItems = await this.listTaskFeedItemsForUser(userId, query);
    if (feedItems.length === 0) {
      return {
        repositoryId: query.repoId ?? null,
        total: 0,
        items: [],
        errors: [],
      };
    }

    const limit = this.resolveLimit(query.limit);
    const items = feedItems
      .slice(0, limit)
      .map(({ sourceVersion, ...item }) => ({
        ...item,
      }));

    return {
      repositoryId: query.repoId ?? null,
      total: items.length,
      items,
      errors: [],
    };
  }

  async listTaskFeedItemsForUser(
    userId: string,
    query: GetTasksQueryDto,
  ): Promise<ResolvedTaskFeedItem[]> {
    this.assertProviderScopeCompatibility(query);

    if (query.repoId) {
      await this.repositoriesService.assertOwnedRepository(
        userId,
        query.repoId,
      );
    }

    const shouldIncludeSyncedTasks =
      query.provider === undefined || query.provider !== 'manual';
    const shouldIncludeManualTasks =
      query.provider === undefined || query.provider === 'manual';

    const connections = shouldIncludeSyncedTasks
      ? await this.taskManagersService.listConnectionsForUser(userId)
      : [];
    const filteredConnections = query.provider
      ? connections.filter(
          (connection) => connection.provider === query.provider,
        )
      : connections;
    const connectionById = new Map(
      filteredConnections.map((connection) => [connection.id, connection]),
    );

    const persistedTasks = shouldIncludeSyncedTasks
      ? await this.syncedTaskRepository.find({
          where:
            query.provider && query.provider !== 'manual'
              ? { userId, provider: query.provider }
              : { userId },
          relations: { scopes: true },
          order: {
            sourceUpdatedAt: 'DESC',
            externalId: 'ASC',
          },
        })
      : [];

    const scopeFilteredTasks = this.filterByScope(persistedTasks, {
      provider: query.provider,
      asanaWorkspaceId: query.asanaWorkspaceId,
      asanaProjectId: query.asanaProjectId,
      jiraProjectKey: query.jiraProjectKey,
    });

    const manualTasks = shouldIncludeManualTasks
      ? await this.listManualTasksForQuery(userId, query)
      : [];

    const repositoryDefaultsLookup =
      await this.taskRepositoryDefaultsService.buildLookupForUser(userId);
    const activeRules =
      await this.automationRulesService.listActiveRulesForUser(userId);
    const taskIds = [
      ...scopeFilteredTasks.map((task) => buildTaskFeedId(task)),
      ...manualTasks.map((task) => buildManualTaskFeedId(task.id)),
    ];
    const draftLookup = this.buildDraftLookup(
      await this.executionsService.listDraftsForTaskIds(userId, taskIds),
    );

    const feedItems = [
      ...this.buildSyncedFeedItems(
        scopeFilteredTasks,
        connectionById,
        repositoryDefaultsLookup,
        activeRules,
        draftLookup,
      ),
      ...this.buildManualFeedItems(
        manualTasks,
        repositoryDefaultsLookup,
        activeRules,
        draftLookup,
      ),
    ];

    return feedItems.sort((a, b) => this.compareItems(a, b));
  }

  async getTaskFeedItemByKey(
    userId: string,
    taskKey: string,
  ): Promise<ResolvedTaskFeedItem | null> {
    const manualTaskId = extractManualTaskId(taskKey);

    if (manualTaskId) {
      const manualTask = await this.manualTaskRepository.findOneBy({
        id: manualTaskId,
        userId,
      });
      if (!manualTask) {
        return null;
      }

      const repositoryDefaultsLookup =
        await this.taskRepositoryDefaultsService.buildLookupForUser(userId);
      const activeRules =
        await this.automationRulesService.listActiveRulesForUser(userId);
      const draftLookup = this.buildDraftLookup(
        await this.executionsService.listDraftsForTaskIds(userId, [taskKey]),
      );

      return this.buildManualFeedItem(
        manualTask,
        repositoryDefaultsLookup,
        activeRules,
        draftLookup,
      );
    }

    const identity = extractTaskFeedIdentity(taskKey);
    if (!identity) {
      return null;
    }

    const persistedTask = await this.syncedTaskRepository.findOne({
      where: {
        userId,
        connectionId: identity.connectionId,
        provider: identity.provider,
        externalId: identity.externalId,
      },
      relations: { scopes: true },
    });
    if (!persistedTask) {
      return null;
    }

    const connections =
      await this.taskManagersService.listConnectionsForUser(userId);
    const connection = connections.find(
      (candidate) => candidate.id === identity.connectionId,
    );
    if (!connection) {
      return null;
    }

    const repositoryDefaultsLookup =
      await this.taskRepositoryDefaultsService.buildLookupForUser(userId);
    const activeRules =
      await this.automationRulesService.listActiveRulesForUser(userId);
    const draftLookup = this.buildDraftLookup(
      await this.executionsService.listDraftsForTaskIds(userId, [taskKey]),
    );

    return this.buildSyncedFeedItem(
      persistedTask,
      repositoryDefaultsLookup,
      activeRules,
      draftLookup,
    );
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

  private async listManualTasksForQuery(
    userId: string,
    query: GetTasksQueryDto,
  ): Promise<ManualTask[]> {
    if (
      query.asanaWorkspaceId !== undefined ||
      query.asanaProjectId !== undefined ||
      query.jiraProjectKey !== undefined
    ) {
      return [];
    }

    return this.manualTaskRepository.find({
      where: { userId },
      order: {
        updatedAt: 'DESC',
        id: 'ASC',
      },
    });
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

    if (
      query.provider === 'manual' &&
      (query.asanaWorkspaceId !== undefined ||
        query.asanaProjectId !== undefined ||
        query.jiraProjectKey !== undefined)
    ) {
      throw new BadRequestException(
        'Scope filters cannot be used with manual provider filter',
      );
    }
  }

  private buildSyncedFeedItems(
    tasks: SyncedTask[],
    connectionById: Map<string, { id: string }>,
    repositoryDefaultsLookup: Awaited<
      ReturnType<TaskRepositoryDefaultsService['buildLookupForUser']>
    >,
    activeRules: Awaited<
      ReturnType<AutomationRulesService['listActiveRulesForUser']>
    >,
    draftLookup: Map<string, ExecutionDraftLookupItem[]>,
  ): ResolvedTaskFeedItem[] {
    const groupedByConnection = new Map<string, SyncedTask[]>();

    for (const task of tasks) {
      if (!connectionById.has(task.connectionId)) {
        continue;
      }

      const existingTasks = groupedByConnection.get(task.connectionId) ?? [];
      existingTasks.push(task);
      groupedByConnection.set(task.connectionId, existingTasks);
    }

    const items: ResolvedTaskFeedItem[] = [];

    for (const [
      connectionId,
      connectionTasks,
    ] of groupedByConnection.entries()) {
      if (!connectionById.has(connectionId)) {
        continue;
      }

      for (const persistedTask of connectionTasks) {
        items.push(
          this.buildSyncedFeedItem(
            persistedTask,
            repositoryDefaultsLookup,
            activeRules,
            draftLookup,
          ),
        );
      }
    }

    return items;
  }

  private buildManualFeedItems(
    tasks: ManualTask[],
    repositoryDefaultsLookup: Awaited<
      ReturnType<TaskRepositoryDefaultsService['buildLookupForUser']>
    >,
    activeRules: Awaited<
      ReturnType<AutomationRulesService['listActiveRulesForUser']>
    >,
    draftLookup: Map<string, ExecutionDraftLookupItem[]>,
  ): ResolvedTaskFeedItem[] {
    return tasks.map((task) =>
      this.buildManualFeedItem(
        task,
        repositoryDefaultsLookup,
        activeRules,
        draftLookup,
      ),
    );
  }

  private buildSyncedFeedItem(
    persistedTask: SyncedTask,
    repositoryDefaultsLookup: Awaited<
      ReturnType<TaskRepositoryDefaultsService['buildLookupForUser']>
    >,
    activeRules: Awaited<
      ReturnType<AutomationRulesService['listActiveRulesForUser']>
    >,
    draftLookup: Map<string, ExecutionDraftLookupItem[]>,
  ): ResolvedTaskFeedItem {
    const primaryScope = this.resolvePrimaryScope(persistedTask.scopes);
    const automationMatch = this.automationRulesService.resolveTaskMatch(
      persistedTask,
      activeRules,
    );
    const taskId = buildTaskFeedId(persistedTask);
    const draftOutcome = this.resolveDraftOutcome(
      draftLookup.get(taskId) ?? [],
      automationMatch,
      resolveTaskSnapshotVersion(persistedTask),
    );
    const repositoryDefaultSuggestion =
      this.taskRepositoryDefaultsService.resolveSuggestedRepository(
        persistedTask.provider,
        persistedTask.scopes,
        repositoryDefaultsLookup,
      );

    return {
      id: taskId,
      connectionId: persistedTask.connectionId,
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
      suggestedRepositoryId:
        automationMatch?.repositoryId ??
        repositoryDefaultSuggestion.repositoryId,
      repositorySelectionSource: automationMatch
        ? 'automation_rule'
        : repositoryDefaultSuggestion.source,
      matchedRuleId: automationMatch?.ruleId ?? null,
      matchedRuleName: automationMatch?.ruleName ?? null,
      suggestedAction: automationMatch?.executionAction ?? null,
      automationMode: automationMatch?.mode ?? null,
      draftExecutionId: draftOutcome.executionId,
      draftStatus: draftOutcome.status,
      executionGroupId: null,
      groupStatus: null,
      groupRepositoryIds: [],
      coordinatedDraftCount: 0,
      automationState: draftOutcome.automationState,
      manualWorkflowState: null,
      hasMultipleScopes: persistedTask.scopes.length > 1,
      updatedAt: this.taskUpdatedAt(persistedTask),
      sourceVersion: this.resolveSourceVersion(persistedTask),
    };
  }

  private buildManualFeedItem(
    task: ManualTask,
    repositoryDefaultsLookup: Awaited<
      ReturnType<TaskRepositoryDefaultsService['buildLookupForUser']>
    >,
    activeRules: Awaited<
      ReturnType<AutomationRulesService['listActiveRulesForUser']>
    >,
    draftLookup: Map<string, ExecutionDraftLookupItem[]>,
  ): ResolvedTaskFeedItem {
    const status = mapManualWorkflowStateToTaskStatus(task.workflowState);
    const automationMatch = this.automationRulesService.resolveTaskMatch(
      {
        provider: 'manual',
        title: task.title,
        status,
        scopes: [],
      },
      activeRules,
    );
    const taskId = buildManualTaskFeedId(task.id);
    const snapshotVersion = resolveManualTaskSnapshotVersion(task);
    const draftOutcome = this.resolveDraftOutcome(
      draftLookup.get(taskId) ?? [],
      automationMatch,
      snapshotVersion,
    );
    const repositoryDefaultSuggestion =
      this.taskRepositoryDefaultsService.resolveSuggestedRepository(
        'manual',
        [],
        repositoryDefaultsLookup,
      );

    return {
      id: taskId,
      connectionId: 'manual',
      externalId: task.id,
      title: task.title,
      description: task.description ?? '',
      url: '',
      status,
      assignee: null,
      source: 'manual',
      primaryScopeType: null,
      primaryScopeId: null,
      primaryScopeName: null,
      suggestedRepositoryId:
        automationMatch?.repositoryId ??
        repositoryDefaultSuggestion.repositoryId,
      repositorySelectionSource: automationMatch
        ? 'automation_rule'
        : repositoryDefaultSuggestion.source,
      matchedRuleId: automationMatch?.ruleId ?? null,
      matchedRuleName: automationMatch?.ruleName ?? null,
      suggestedAction: automationMatch?.executionAction ?? null,
      automationMode: automationMatch?.mode ?? null,
      draftExecutionId: draftOutcome.executionId,
      draftStatus: draftOutcome.status,
      executionGroupId: null,
      groupStatus: null,
      groupRepositoryIds: [],
      coordinatedDraftCount: 0,
      automationState: draftOutcome.automationState,
      manualWorkflowState:
        draftOutcome.automationState === 'drafted'
          ? 'drafted'
          : task.workflowState,
      hasMultipleScopes: false,
      updatedAt: task.updatedAt.toISOString(),
      sourceVersion: snapshotVersion.toISOString(),
    };
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

  private buildDraftLookup(
    drafts: ExecutionDraftLookupItem[],
  ): Map<string, ExecutionDraftLookupItem[]> {
    const draftLookup = new Map<string, ExecutionDraftLookupItem[]>();

    for (const draft of drafts) {
      const existing = draftLookup.get(draft.taskId) ?? [];
      existing.push(draft);
      draftLookup.set(draft.taskId, existing);
    }

    return draftLookup;
  }

  private resolveDraftOutcome(
    drafts: ExecutionDraftLookupItem[],
    automationMatch: ReturnType<AutomationRulesService['resolveTaskMatch']>,
    snapshotVersion: Date | null,
  ): {
    executionId: string | null;
    status: ExecutionDraftStatus | null;
    automationState: TaskAutomationState;
  } {
    if (!automationMatch) {
      return {
        executionId: null,
        status: null,
        automationState: 'none',
      };
    }

    if (automationMatch.mode !== 'draft') {
      return {
        executionId: null,
        status: null,
        automationState: 'matched',
      };
    }

    const relevantDrafts = drafts.filter(
      (draft) =>
        draft.originRuleId === automationMatch.ruleId &&
        draft.repositoryId === automationMatch.repositoryId,
    );

    const readyDraft = relevantDrafts.find(
      (draft) =>
        draft.draftStatus === 'ready' &&
        this.sameSnapshotVersion(
          draft.sourceTaskSnapshotUpdatedAt,
          snapshotVersion,
        ),
    );

    if (readyDraft) {
      return {
        executionId: readyDraft.id,
        status: 'ready',
        automationState: 'drafted',
      };
    }

    if (relevantDrafts.length > 0) {
      return {
        executionId: null,
        status: 'superseded',
        automationState: 'matched',
      };
    }

    return {
      executionId: null,
      status: null,
      automationState: 'matched',
    };
  }

  private sameSnapshotVersion(left: Date | null, right: Date | null): boolean {
    if (left === null || right === null) {
      return left === right;
    }

    return left.getTime() === right.getTime();
  }

  private taskUpdatedAt(
    task: Pick<SyncedTask, 'sourceUpdatedAt' | 'updatedAt'>,
  ): string {
    return (task.sourceUpdatedAt ?? task.updatedAt).toISOString();
  }

  private resolveSourceVersion(
    task: Pick<SyncedTask, 'sourceUpdatedAt'>,
  ): string | null {
    return resolveTaskSnapshotVersion(task)?.toISOString() ?? null;
  }

  private compareItems(
    a: ResolvedTaskFeedItem,
    b: ResolvedTaskFeedItem,
  ): number {
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
