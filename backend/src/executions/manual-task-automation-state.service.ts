import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ManualTask,
  ManualTaskWorkflowState,
} from '../manual-tasks/entities/manual-task.entity';
import { Execution } from './entities/execution.entity';
import {
  extractManualTaskId,
  buildManualTaskFeedId,
} from '../tasks/utils/task-feed-id.utils';
import { resolveManualTaskSnapshotVersion } from '../tasks/utils/task-snapshot-version.utils';

@Injectable()
export class ManualTaskAutomationStateService {
  constructor(
    @InjectRepository(ManualTask)
    private readonly manualTaskRepository: Repository<ManualTask>,
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
  ) {}

  async resetToInbox(userId: string, taskId: string): Promise<void> {
    await this.manualTaskRepository.update(
      { id: taskId, userId },
      { workflowState: 'inbox' },
    );
  }

  async reconcileTask(userId: string, taskId: string): Promise<void> {
    const task = await this.manualTaskRepository.findOneBy({
      id: taskId,
      userId,
    });
    if (!task) {
      return;
    }

    await this.persistResolvedState(
      task,
      await this.resolveWorkflowState(task),
    );
  }

  async reconcileTasks(userId: string, taskIds: string[]): Promise<void> {
    const normalizedTaskIds = [...new Set(taskIds)];
    if (normalizedTaskIds.length === 0) {
      return;
    }

    const tasks = await this.manualTaskRepository.find({
      where: {
        id: In(normalizedTaskIds),
        userId,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    for (const task of tasks) {
      await this.persistResolvedState(
        task,
        await this.resolveWorkflowState(task),
      );
    }
  }

  async reconcileFromExecution(executionId: string): Promise<void> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
      select: {
        id: true,
        userId: true,
        taskId: true,
        taskSource: true,
      },
    });
    if (!execution || execution.taskSource !== 'manual') {
      return;
    }

    const manualTaskId = extractManualTaskId(execution.taskId);
    if (!manualTaskId) {
      return;
    }

    await this.reconcileTask(execution.userId, manualTaskId);
  }

  private async resolveWorkflowState(
    task: Pick<ManualTask, 'id' | 'userId' | 'contentUpdatedAt'>,
  ): Promise<ManualTaskWorkflowState> {
    const executions = await this.executionRepository.find({
      where: {
        userId: task.userId,
        taskId: In([buildManualTaskFeedId(task.id), task.id]),
        taskSource: 'manual',
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });

    const snapshotVersion = resolveManualTaskSnapshotVersion(task);
    const currentSnapshotExecutions = executions.filter((execution) =>
      this.sameSnapshotVersion(
        execution.sourceTaskSnapshotUpdatedAt,
        snapshotVersion,
      ),
    );

    const activeExecution = currentSnapshotExecutions.find(
      (execution) =>
        !execution.isDraft &&
        (execution.status === 'pending' ||
          execution.status === 'running' ||
          execution.orchestrationState === 'queued' ||
          execution.orchestrationState === 'running' ||
          execution.orchestrationState === 'finalizing'),
    );
    if (activeExecution) {
      return 'in_progress';
    }

    const readyDraft = currentSnapshotExecutions.find(
      (execution) => execution.isDraft && execution.draftStatus === 'ready',
    );
    if (readyDraft) {
      return 'drafted';
    }

    const latestFinishedExecution = currentSnapshotExecutions.find(
      (execution) => !execution.isDraft,
    );
    if (!latestFinishedExecution) {
      return 'inbox';
    }

    if (
      latestFinishedExecution.status === 'completed' &&
      latestFinishedExecution.orchestrationState === 'done'
    ) {
      return 'done';
    }

    if (
      latestFinishedExecution.orchestrationState ===
        'awaiting_review_decision' ||
      latestFinishedExecution.reviewGateStatus === 'awaiting_decision' ||
      latestFinishedExecution.reviewGateStatus === 'decision_block' ||
      latestFinishedExecution.status === 'failed' ||
      latestFinishedExecution.status === 'cancelled'
    ) {
      return 'blocked';
    }

    return 'inbox';
  }

  private async persistResolvedState(
    task: Pick<ManualTask, 'id' | 'userId' | 'workflowState'>,
    workflowState: ManualTaskWorkflowState,
  ): Promise<void> {
    if (task.workflowState === workflowState) {
      return;
    }

    await this.manualTaskRepository.update(
      { id: task.id, userId: task.userId },
      { workflowState },
    );
  }

  private sameSnapshotVersion(left: Date | null, right: Date | null): boolean {
    if (left === null || right === null) {
      return left === right;
    }

    return left.getTime() === right.getTime();
  }
}
