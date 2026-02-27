import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { Execution } from '../../src/executions/entities/execution.entity';
import type {
  ExecutionAction,
  ExecutionStatus,
  TaskSource,
} from '../../src/executions/interfaces/execution.types';

type CreateExecutionInput = {
  userId: string;
  repositoryId: string;
  taskId?: string;
  taskExternalId?: string;
  taskTitle?: string;
  taskDescription?: string | null;
  taskSource?: TaskSource;
  action?: ExecutionAction;
  prompt?: string;
  status?: ExecutionStatus;
  output?: string;
  outputTruncated?: boolean;
  pid?: number | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  exitCode?: number | null;
  errorMessage?: string | null;
};

export class ExecutionFactory {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateExecutionInput): Promise<Execution> {
    const executionRepository = this.dataSource.getRepository(Execution);
    const execution = executionRepository.create({
      userId: input.userId,
      repositoryId: input.repositoryId,
      taskId: input.taskId ?? faker.string.alphanumeric(12).toLowerCase(),
      taskExternalId: input.taskExternalId ?? `TASK-${faker.string.numeric(4)}`,
      taskTitle: input.taskTitle ?? faker.lorem.sentence(),
      taskDescription:
        input.taskDescription === undefined
          ? faker.lorem.paragraph({ min: 1, max: 2 })
          : input.taskDescription,
      taskSource: input.taskSource ?? 'jira',
      action: input.action ?? 'fix',
      prompt: input.prompt ?? faker.lorem.paragraph(),
      status: input.status ?? 'completed',
      output: input.output ?? faker.lorem.paragraph(),
      outputTruncated: input.outputTruncated ?? false,
      pid: input.pid ?? null,
      startedAt: input.startedAt ?? new Date(),
      finishedAt: input.finishedAt ?? new Date(),
      exitCode: input.exitCode ?? 0,
      errorMessage: input.errorMessage ?? null,
    });

    return executionRepository.save(execution);
  }
}
