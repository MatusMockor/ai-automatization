import { faker } from '@faker-js/faker';
import { DataSource } from 'typeorm';
import { Execution } from '../../src/executions/entities/execution.entity';
import type {
  AutomationStatus,
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
  automationStatus?: AutomationStatus;
  automationAttempts?: number;
  branchName?: string | null;
  commitSha?: string | null;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
  pullRequestTitle?: string | null;
  automationErrorMessage?: string | null;
  automationCompletedAt?: Date | null;
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
    const status = input.status ?? 'completed';
    const isTerminal =
      status === 'completed' || status === 'failed' || status === 'cancelled';
    const defaultStartedAt = status === 'pending' ? null : new Date();
    const defaultFinishedAt = isTerminal ? new Date() : null;
    const defaultExitCode = status === 'completed' ? 0 : null;
    const defaultErrorMessage =
      status === 'failed'
        ? 'Execution failed'
        : status === 'cancelled'
          ? 'Execution cancelled'
          : null;

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
      status,
      automationStatus: input.automationStatus ?? 'pending',
      automationAttempts: input.automationAttempts ?? 0,
      branchName: input.branchName ?? null,
      commitSha: input.commitSha ?? null,
      pullRequestNumber: input.pullRequestNumber ?? null,
      pullRequestUrl: input.pullRequestUrl ?? null,
      pullRequestTitle: input.pullRequestTitle ?? null,
      automationErrorMessage: input.automationErrorMessage ?? null,
      automationCompletedAt: input.automationCompletedAt ?? null,
      output: input.output ?? faker.lorem.paragraph(),
      outputTruncated: input.outputTruncated ?? false,
      pid: input.pid ?? null,
      startedAt: input.startedAt ?? defaultStartedAt,
      finishedAt: input.finishedAt ?? defaultFinishedAt,
      exitCode: input.exitCode ?? defaultExitCode,
      errorMessage: input.errorMessage ?? defaultErrorMessage,
    });

    return executionRepository.save(execution);
  }
}
