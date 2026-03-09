import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Execution } from '../executions/entities/execution.entity';
import type { TaskAutomationState } from '../executions/interfaces/execution.types';
import { RepositoriesService } from '../repositories/repositories.service';
import { AutomationInboxHistoryResponseDto } from './dto/automation-inbox-history-response.dto';
import {
  AutomationInboxItemDto,
  AutomationInboxNextAction,
  AutomationInboxReasonCode,
  AutomationInboxResponseDto,
} from './dto/automation-inbox-response.dto';
import { GetAutomationInboxQueryDto } from './dto/get-automation-inbox-query.dto';
import { TaskKeyAutomationInboxItemDto } from './dto/task-key-automation-inbox-item.dto';
import { SnoozeAutomationInboxItemDto } from './dto/snooze-automation-inbox-item.dto';
import { TaskAutomationControl } from './entities/task-automation-control.entity';
import { TasksService } from './tasks.service';
import { ResolvedTaskFeedItem } from './task-feed.types';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';

type LatestExecutionLookupItem = Pick<
  Execution,
  | 'id'
  | 'taskId'
  | 'status'
  | 'reviewGateStatus'
  | 'orchestrationState'
  | 'createdAt'
  | 'updatedAt'
>;

type HistoryExecutionItem = Pick<
  Execution,
  | 'id'
  | 'taskId'
  | 'originRuleId'
  | 'isDraft'
  | 'draftStatus'
  | 'createdAt'
  | 'updatedAt'
  | 'startedAt'
>;

type ActiveControlResolution = {
  controlType: TaskAutomationControl['controlType'];
  untilAt: Date | null;
};

type InboxReason = {
  reasonCode: AutomationInboxReasonCode;
  reasonText: string;
  nextAction: AutomationInboxNextAction;
};

@Injectable()
export class AutomationInboxService {
  private readonly defaultLimit = 100;
  private readonly maxLimit = 200;

  constructor(
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    @InjectRepository(TaskAutomationControl)
    private readonly taskAutomationControlRepository: Repository<TaskAutomationControl>,
    private readonly tasksService: TasksService,
    private readonly repositoriesService: RepositoriesService,
  ) {}

  async listForUser(
    userId: string,
    query: GetAutomationInboxQueryDto,
  ): Promise<AutomationInboxResponseDto> {
    if (query.repositoryId) {
      await this.repositoriesService.assertOwnedRepository(
        userId,
        query.repositoryId,
      );
    }

    const taskFeedQuery = new GetTasksQueryDto();
    taskFeedQuery.provider = query.provider;

    const feedItems = await this.tasksService.listTaskFeedItemsForUser(
      userId,
      taskFeedQuery,
    );
    if (feedItems.length === 0) {
      return {
        total: 0,
        items: [],
      };
    }

    const latestExecutionLookup = await this.loadLatestExecutionLookup(
      userId,
      feedItems,
    );
    const controlLookup = await this.loadControlLookup(
      userId,
      feedItems.map((item) => item.id),
    );

    const includeSuppressed = query.includeSuppressed ?? false;
    const items = feedItems
      .map((item) =>
        this.buildInboxItem(
          item,
          latestExecutionLookup.get(item.id) ?? null,
          controlLookup.get(item.id) ?? null,
          includeSuppressed,
        ),
      )
      .filter((item): item is AutomationInboxItemDto => item !== null)
      .filter((item) => this.matchesFilters(item, query));

    const limit = this.resolveLimit(query.limit);
    return {
      total: items.length,
      items: items.slice(0, limit),
    };
  }

  async snoozeForUser(
    userId: string,
    dto: SnoozeAutomationInboxItemDto,
  ): Promise<void> {
    const untilAt = new Date(dto.untilAt);
    if (Number.isNaN(untilAt.getTime()) || untilAt.getTime() <= Date.now()) {
      throw new BadRequestException('untilAt must be a future timestamp');
    }

    const task = await this.getTaskFeedItemForUser(userId, dto.taskKey);
    await this.upsertControl(userId, task, {
      controlType: 'snooze',
      untilAt,
      sourceVersion: task.sourceVersion,
    });
  }

  async dismissForUser(
    userId: string,
    dto: TaskKeyAutomationInboxItemDto,
  ): Promise<void> {
    const task = await this.getTaskFeedItemForUser(userId, dto.taskKey);
    await this.upsertControl(userId, task, {
      controlType: 'dismiss_until_change',
      untilAt: null,
      sourceVersion: task.sourceVersion,
    });
  }

  async restoreForUser(
    userId: string,
    dto: TaskKeyAutomationInboxItemDto,
  ): Promise<void> {
    const existingControl =
      await this.taskAutomationControlRepository.findOneBy({
        userId,
        taskKey: dto.taskKey,
      });

    if (!existingControl) {
      await this.getTaskFeedItemForUser(userId, dto.taskKey);
      return;
    }

    if (!existingControl.isActive) {
      return;
    }

    existingControl.isActive = false;
    existingControl.restoredAt = new Date();
    await this.taskAutomationControlRepository.save(existingControl);
  }

  async getHistoryForUser(
    userId: string,
    taskKey: string,
  ): Promise<AutomationInboxHistoryResponseDto> {
    const task = await this.getTaskFeedItemForUser(userId, taskKey);
    const executions = await this.loadExecutionsForHistory(userId, task);
    const control = await this.taskAutomationControlRepository.findOneBy({
      userId,
      taskKey,
    });

    const items = [
      ...(task.matchedRuleId
        ? [
            {
              type: 'rule_matched' as const,
              occurredAt: task.updatedAt,
              executionId: null,
              ruleId: task.matchedRuleId,
              ruleName: task.matchedRuleName,
              message: task.matchedRuleName
                ? `Task currently matches automation rule "${task.matchedRuleName}".`
                : 'Task currently matches an automation rule.',
            },
          ]
        : []),
      ...this.buildExecutionHistoryItems(task, executions),
      ...this.buildControlHistoryItems(task, control),
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

    return {
      taskKey,
      items,
    };
  }

  private async getTaskFeedItemForUser(
    userId: string,
    taskKey: string,
  ): Promise<ResolvedTaskFeedItem> {
    const taskFeedQuery = new GetTasksQueryDto();
    const items = await this.tasksService.listTaskFeedItemsForUser(
      userId,
      taskFeedQuery,
    );
    const task = items.find((item) => item.id === taskKey);
    if (!task) {
      throw new NotFoundException('Automation inbox task not found');
    }

    return task;
  }

  private async upsertControl(
    userId: string,
    task: ResolvedTaskFeedItem,
    values: Pick<
      TaskAutomationControl,
      'controlType' | 'untilAt' | 'sourceVersion'
    >,
  ): Promise<void> {
    const existingControl =
      await this.taskAutomationControlRepository.findOneBy({
        userId,
        taskKey: task.id,
      });

    if (!existingControl) {
      await this.taskAutomationControlRepository.save(
        this.taskAutomationControlRepository.create({
          userId,
          taskKey: task.id,
          controlType: values.controlType,
          untilAt: values.untilAt,
          sourceVersion: values.sourceVersion,
          isActive: true,
          restoredAt: null,
        }),
      );
      return;
    }

    existingControl.controlType = values.controlType;
    existingControl.untilAt = values.untilAt;
    existingControl.sourceVersion = values.sourceVersion;
    existingControl.isActive = true;
    existingControl.restoredAt = null;
    await this.taskAutomationControlRepository.save(existingControl);
  }

  private async loadControlLookup(
    userId: string,
    taskKeys: string[],
  ): Promise<Map<string, TaskAutomationControl>> {
    if (taskKeys.length === 0) {
      return new Map();
    }

    const controls = await this.taskAutomationControlRepository.find({
      where: {
        userId,
        taskKey: In(taskKeys),
      },
      order: {
        updatedAt: 'DESC',
      },
    });

    return new Map(controls.map((control) => [control.taskKey, control]));
  }

  private async loadLatestExecutionLookup(
    userId: string,
    feedItems: ResolvedTaskFeedItem[],
  ): Promise<Map<string, LatestExecutionLookupItem>> {
    if (feedItems.length === 0) {
      return new Map();
    }

    const executionTaskIdToTaskKey = new Map<string, string>();
    for (const item of feedItems) {
      executionTaskIdToTaskKey.set(item.id, item.id);
      if (item.source === 'manual') {
        executionTaskIdToTaskKey.set(item.externalId, item.id);
      }
    }

    const executions = await this.executionRepository.find({
      where: {
        userId,
        taskId: In([...executionTaskIdToTaskKey.keys()]),
        isDraft: false,
      },
      select: {
        id: true,
        taskId: true,
        status: true,
        reviewGateStatus: true,
        orchestrationState: true,
        createdAt: true,
        updatedAt: true,
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });

    const lookup = new Map<string, LatestExecutionLookupItem>();
    for (const execution of executions) {
      const taskKey = executionTaskIdToTaskKey.get(execution.taskId);
      if (!taskKey || lookup.has(taskKey)) {
        continue;
      }

      lookup.set(taskKey, execution);
    }

    return lookup;
  }

  private buildInboxItem(
    task: ResolvedTaskFeedItem,
    latestExecution: LatestExecutionLookupItem | null,
    control: TaskAutomationControl | null,
    includeSuppressed: boolean,
  ): AutomationInboxItemDto | null {
    const activeControl = this.resolveActiveControl(
      control,
      task.sourceVersion,
    );
    if (activeControl && !includeSuppressed) {
      return null;
    }

    const resolvedReason = this.resolveReason(
      task,
      latestExecution,
      activeControl,
    );
    if (!resolvedReason) {
      return null;
    }

    return {
      taskKey: task.id,
      taskId: task.externalId,
      source: task.source,
      title: task.title,
      status: task.status,
      updatedAt: task.updatedAt,
      manualWorkflowState: task.manualWorkflowState,
      matchedRuleId: task.matchedRuleId,
      matchedRuleName: task.matchedRuleName,
      suggestedRepositoryId: task.suggestedRepositoryId,
      repositorySelectionSource: task.repositorySelectionSource,
      suggestedAction: task.suggestedAction,
      automationMode: task.automationMode,
      draftExecutionId: task.draftExecutionId,
      draftStatus: task.draftStatus,
      latestExecutionId: latestExecution?.id ?? null,
      latestExecutionStatus: latestExecution?.status ?? null,
      reasonCode: resolvedReason.reasonCode,
      reasonText: resolvedReason.reasonText,
      nextAction: resolvedReason.nextAction,
    };
  }

  private resolveActiveControl(
    control: TaskAutomationControl | null,
    sourceVersion: string | null,
  ): ActiveControlResolution | null {
    if (!control || !control.isActive) {
      return null;
    }

    if (control.controlType === 'snooze') {
      if (!control.untilAt || control.untilAt.getTime() <= Date.now()) {
        return null;
      }

      return {
        controlType: control.controlType,
        untilAt: control.untilAt,
      };
    }

    if (
      control.controlType === 'dismiss_until_change' &&
      control.sourceVersion !== null &&
      sourceVersion !== null &&
      control.sourceVersion !== sourceVersion
    ) {
      return null;
    }

    return {
      controlType: control.controlType,
      untilAt: control.untilAt,
    };
  }

  private resolveReason(
    task: ResolvedTaskFeedItem,
    latestExecution: LatestExecutionLookupItem | null,
    activeControl: ActiveControlResolution | null,
  ): InboxReason | null {
    if (activeControl?.controlType === 'snooze') {
      return {
        reasonCode: 'snoozed',
        reasonText: `Task is snoozed until ${activeControl.untilAt?.toISOString()}.`,
        nextAction: 'none',
      };
    }

    if (activeControl?.controlType === 'dismiss_until_change') {
      return {
        reasonCode: 'dismissed_until_change',
        reasonText: 'Task is hidden until its source content changes.',
        nextAction: 'none',
      };
    }

    if (task.draftStatus === 'ready' && task.draftExecutionId) {
      return {
        reasonCode: 'draft_ready',
        reasonText: 'A draft execution is ready to start.',
        nextAction: 'start_draft',
      };
    }

    if (task.draftStatus === 'superseded') {
      return {
        reasonCode: 'draft_superseded',
        reasonText: 'The last draft for this task was superseded.',
        nextAction: 'none',
      };
    }

    if (this.isBlockingExecution(latestExecution)) {
      return {
        reasonCode: 'blocked_by_execution_failure',
        reasonText:
          'The latest execution for this task is blocked, failed, or awaiting review.',
        nextAction: task.matchedRuleId ? 'edit_rule' : 'none',
      };
    }

    if (task.automationState === 'matched' && task.matchedRuleId) {
      if (!task.suggestedRepositoryId) {
        return {
          reasonCode: 'no_repository_selected',
          reasonText:
            'Task matches automation logic but no repository is currently selected.',
          nextAction: 'assign_repository',
        };
      }

      return {
        reasonCode: 'matched_rule_no_draft',
        reasonText:
          task.automationMode === 'suggest'
            ? 'Task matches a suggest rule and has no draft execution.'
            : 'Task matches a draft rule but currently has no ready draft.',
        nextAction: 'none',
      };
    }

    return null;
  }

  private isBlockingExecution(
    latestExecution: LatestExecutionLookupItem | null,
  ): boolean {
    if (!latestExecution) {
      return false;
    }

    if (
      latestExecution.status === 'failed' ||
      latestExecution.status === 'cancelled'
    ) {
      return true;
    }

    return (
      latestExecution.orchestrationState === 'awaiting_review_decision' ||
      latestExecution.reviewGateStatus === 'awaiting_decision' ||
      latestExecution.reviewGateStatus === 'decision_block'
    );
  }

  private matchesFilters(
    item: AutomationInboxItemDto,
    query: GetAutomationInboxQueryDto,
  ): boolean {
    if (query.provider && item.source !== query.provider) {
      return false;
    }

    if (
      query.repositoryId &&
      item.suggestedRepositoryId !== query.repositoryId
    ) {
      return false;
    }

    if (query.ruleId && item.matchedRuleId !== query.ruleId) {
      return false;
    }

    if (query.automationState && item.automationMode === null) {
      return false;
    }

    if (
      query.automationState &&
      !this.matchesAutomationStateFilter(item, query.automationState)
    ) {
      return false;
    }

    if (query.draftStatus && item.draftStatus !== query.draftStatus) {
      return false;
    }

    return true;
  }

  private matchesAutomationStateFilter(
    item: AutomationInboxItemDto,
    automationState: TaskAutomationState,
  ): boolean {
    if (item.reasonCode === 'draft_ready') {
      return automationState === 'drafted';
    }

    if (
      item.reasonCode === 'draft_superseded' ||
      item.reasonCode === 'matched_rule_no_draft' ||
      item.reasonCode === 'blocked_by_execution_failure' ||
      item.reasonCode === 'no_repository_selected'
    ) {
      return automationState === 'matched';
    }

    return false;
  }

  private buildExecutionHistoryItems(
    task: ResolvedTaskFeedItem,
    executions: HistoryExecutionItem[],
  ): AutomationInboxHistoryResponseDto['items'] {
    const items: AutomationInboxHistoryResponseDto['items'] = [];

    for (const execution of executions) {
      if (execution.originRuleId) {
        items.push({
          type: 'draft_created',
          occurredAt: execution.createdAt.toISOString(),
          executionId: execution.id,
          ruleId: execution.originRuleId,
          ruleName:
            task.matchedRuleId === execution.originRuleId
              ? task.matchedRuleName
              : null,
          message: 'Automation draft was created for this task.',
        });
      }

      if (execution.draftStatus === 'superseded') {
        items.push({
          type: 'draft_superseded',
          occurredAt: execution.updatedAt.toISOString(),
          executionId: execution.id,
          ruleId: execution.originRuleId,
          ruleName:
            task.matchedRuleId === execution.originRuleId
              ? task.matchedRuleName
              : null,
          message: 'Draft execution was superseded.',
        });
      }

      if (!execution.isDraft && execution.originRuleId) {
        items.push({
          type: 'draft_started',
          occurredAt: (
            execution.startedAt ?? execution.updatedAt
          ).toISOString(),
          executionId: execution.id,
          ruleId: execution.originRuleId,
          ruleName:
            task.matchedRuleId === execution.originRuleId
              ? task.matchedRuleName
              : null,
          message: 'Draft execution was started.',
        });
      }
    }

    return items;
  }

  private buildControlHistoryItems(
    task: ResolvedTaskFeedItem,
    control: TaskAutomationControl | null,
  ): AutomationInboxHistoryResponseDto['items'] {
    if (!control) {
      return [];
    }

    const items: AutomationInboxHistoryResponseDto['items'] = [];
    const controlOccurredAt = control.updatedAt.toISOString();

    if (control.controlType === 'snooze') {
      items.push({
        type: 'task_snoozed',
        occurredAt: controlOccurredAt,
        executionId: null,
        ruleId: null,
        ruleName: null,
        message: control.untilAt
          ? `Task was snoozed until ${control.untilAt.toISOString()}.`
          : 'Task was snoozed.',
      });
    } else {
      items.push({
        type: 'task_dismissed',
        occurredAt: controlOccurredAt,
        executionId: null,
        ruleId: null,
        ruleName: null,
        message: 'Task was dismissed until its source changes.',
      });
    }

    if (control.restoredAt) {
      items.push({
        type: 'task_restored',
        occurredAt: control.restoredAt.toISOString(),
        executionId: null,
        ruleId: null,
        ruleName: null,
        message: 'Task was restored to the automation inbox.',
      });
    } else if (
      control.isActive &&
      control.controlType === 'dismiss_until_change' &&
      control.sourceVersion !== null &&
      task.sourceVersion !== null &&
      control.sourceVersion !== task.sourceVersion
    ) {
      items.push({
        type: 'task_restored',
        occurredAt: task.updatedAt,
        executionId: null,
        ruleId: null,
        ruleName: null,
        message: 'Task returned to the automation inbox after content change.',
      });
    }

    return items;
  }

  private async loadExecutionsForHistory(
    userId: string,
    task: ResolvedTaskFeedItem,
  ): Promise<HistoryExecutionItem[]> {
    const executionTaskIds =
      task.source === 'manual' ? [task.id, task.externalId] : [task.id];

    return this.executionRepository.find({
      where: {
        userId,
        taskId: In(executionTaskIds),
      },
      select: {
        id: true,
        taskId: true,
        originRuleId: true,
        isDraft: true,
        draftStatus: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });
  }

  private resolveLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return this.defaultLimit;
    }

    if (!Number.isFinite(limit)) {
      return this.defaultLimit;
    }

    const normalizedLimit = Math.trunc(limit);
    if (normalizedLimit <= 0) {
      return this.defaultLimit;
    }

    return Math.min(normalizedLimit, this.maxLimit);
  }
}
