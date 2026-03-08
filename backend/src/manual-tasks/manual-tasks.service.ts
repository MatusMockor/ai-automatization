import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AutomationRulesService } from '../automation-rules/automation-rules.service';
import { Execution } from '../executions/entities/execution.entity';
import { ExecutionsService } from '../executions/executions.service';
import { CreateManualTaskDto } from './dto/create-manual-task.dto';
import { ManualTaskResponseDto } from './dto/manual-task-response.dto';
import { UpdateManualTaskDto } from './dto/update-manual-task.dto';
import { ManualTask } from './entities/manual-task.entity';
import { buildManualTaskFeedId } from '../tasks/utils/task-feed-id.utils';

type ManualTaskExecutionPointers = {
  latestDraftExecutionId: string | null;
  latestExecutionId: string | null;
};

@Injectable()
export class ManualTasksService {
  constructor(
    @InjectRepository(ManualTask)
    private readonly manualTaskRepository: Repository<ManualTask>,
    @InjectRepository(Execution)
    private readonly executionRepository: Repository<Execution>,
    private readonly automationRulesService: AutomationRulesService,
    private readonly executionsService: ExecutionsService,
  ) {}

  async listForUser(userId: string): Promise<ManualTaskResponseDto[]> {
    const tasks = await this.manualTaskRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const executionPointers = await this.loadExecutionPointers(userId, tasks);

    return tasks.map((task) =>
      this.mapToResponse(task, executionPointers.get(task.id)),
    );
  }

  async createForUser(
    userId: string,
    dto: CreateManualTaskDto,
  ): Promise<ManualTaskResponseDto> {
    const manualTask = this.manualTaskRepository.create({
      userId,
      title: dto.title,
      description: dto.description ?? null,
      contentUpdatedAt: new Date(),
      workflowState: 'inbox',
    });

    const savedTask = await this.manualTaskRepository.save(manualTask);
    this.automationRulesService.scheduleReconcileForUser(userId, ['manual']);
    return this.mapToResponse(savedTask);
  }

  async updateForUser(
    userId: string,
    taskId: string,
    dto: UpdateManualTaskDto,
  ): Promise<ManualTaskResponseDto> {
    if (dto.title === undefined && dto.description === undefined) {
      throw new BadRequestException(
        'At least one field must be provided for update',
      );
    }

    const manualTask = await this.getOwnedTask(userId, taskId);
    if (dto.title !== undefined) {
      manualTask.title = dto.title;
    }
    if (dto.description !== undefined) {
      manualTask.description = dto.description;
    }
    manualTask.contentUpdatedAt = new Date();
    manualTask.workflowState = 'inbox';

    const savedTask = await this.manualTaskRepository.save(manualTask);
    this.automationRulesService.scheduleReconcileForUser(userId, ['manual']);
    return this.mapToResponse(savedTask);
  }

  async deleteForUser(userId: string, taskId: string): Promise<void> {
    const manualTask = await this.getOwnedTask(userId, taskId);
    await this.executionsService.supersedeReadyDraftsForTask(
      userId,
      buildManualTaskFeedId(taskId),
    );
    await this.manualTaskRepository.remove(manualTask);
    this.automationRulesService.scheduleReconcileForUser(userId, ['manual']);
  }

  private async getOwnedTask(
    userId: string,
    taskId: string,
  ): Promise<ManualTask> {
    const task = await this.manualTaskRepository.findOneBy({
      id: taskId,
      userId,
    });
    if (!task) {
      throw new NotFoundException('Manual task not found');
    }

    return task;
  }

  private async loadExecutionPointers(
    userId: string,
    tasks: ManualTask[],
  ): Promise<Map<string, ManualTaskExecutionPointers>> {
    if (tasks.length === 0) {
      return new Map();
    }

    const feedIdToTaskId = new Map<string, string>();
    for (const task of tasks) {
      feedIdToTaskId.set(buildManualTaskFeedId(task.id), task.id);
      feedIdToTaskId.set(task.id, task.id);
    }
    const executions = await this.executionRepository.find({
      where: {
        userId,
        taskSource: 'manual',
        taskId: In([...feedIdToTaskId.keys()]),
      },
      select: {
        id: true,
        taskId: true,
        isDraft: true,
        createdAt: true,
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });

    const pointers = new Map<string, ManualTaskExecutionPointers>();
    for (const task of tasks) {
      pointers.set(task.id, {
        latestDraftExecutionId: null,
        latestExecutionId: null,
      });
    }

    for (const execution of executions) {
      const manualTaskId = feedIdToTaskId.get(execution.taskId);
      if (!manualTaskId) {
        continue;
      }

      const currentPointers = pointers.get(manualTaskId);
      if (!currentPointers) {
        continue;
      }

      if (execution.isDraft) {
        if (currentPointers.latestDraftExecutionId === null) {
          currentPointers.latestDraftExecutionId = execution.id;
        }
        continue;
      }

      if (currentPointers.latestExecutionId === null) {
        currentPointers.latestExecutionId = execution.id;
      }
    }

    return pointers;
  }

  private mapToResponse(
    task: ManualTask,
    executionPointers?: ManualTaskExecutionPointers,
  ): ManualTaskResponseDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      workflowState: task.workflowState,
      latestDraftExecutionId: executionPointers?.latestDraftExecutionId ?? null,
      latestExecutionId: executionPointers?.latestExecutionId ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
