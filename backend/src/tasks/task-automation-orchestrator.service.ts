import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AutomationRulesService } from '../automation-rules/automation-rules.service';
import { ExecutionsService } from '../executions/executions.service';
import { SyncedTask } from './entities/synced-task.entity';
import { buildTaskFeedId } from './utils/task-feed-id.utils';
import { resolveTaskSnapshotVersion } from './utils/task-snapshot-version.utils';

@Injectable()
export class TaskAutomationOrchestratorService {
  private readonly logger = new Logger(TaskAutomationOrchestratorService.name);

  constructor(
    @InjectRepository(SyncedTask)
    private readonly syncedTaskRepository: Repository<SyncedTask>,
    private readonly automationRulesService: AutomationRulesService,
    private readonly executionsService: ExecutionsService,
  ) {}

  async processSyncedTasks(userId: string, taskIds: string[]): Promise<void> {
    const normalizedTaskIds = [...new Set(taskIds)];
    if (normalizedTaskIds.length === 0) {
      return;
    }

    const tasks = await this.syncedTaskRepository.find({
      where: {
        userId,
        id: In(normalizedTaskIds),
      },
      relations: {
        scopes: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    if (tasks.length === 0) {
      return;
    }

    const activeRules =
      await this.automationRulesService.listActiveRulesForUser(userId);

    for (const task of tasks) {
      try {
        const match = this.automationRulesService.resolveTaskMatch(
          task,
          activeRules,
        );
        const taskId = buildTaskFeedId(task);

        if (
          !match ||
          match.mode !== 'draft' ||
          match.executionAction === null
        ) {
          await this.executionsService.supersedeReadyDraftsForTask(
            userId,
            taskId,
          );
          continue;
        }

        await this.executionsService.createOrRefreshDraftForTask({
          userId,
          repositoryId: match.repositoryId,
          taskId,
          taskExternalId: task.externalId,
          taskTitle: task.title,
          taskDescription: task.description ?? null,
          taskSource: task.provider,
          action: match.executionAction,
          originRuleId: match.ruleId,
          sourceTaskSnapshotUpdatedAt: resolveTaskSnapshotVersion(task),
        });
      } catch (error) {
        this.logger.error(
          `Failed to evaluate automation for synced task ${task.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async supersedeDraftsForTaskIds(
    userId: string,
    taskIds: string[],
  ): Promise<void> {
    const normalizedTaskIds = [...new Set(taskIds)];
    if (normalizedTaskIds.length === 0) {
      return;
    }

    await this.executionsService.supersedeReadyDraftsForTaskIds(
      userId,
      normalizedTaskIds,
    );
  }
}
