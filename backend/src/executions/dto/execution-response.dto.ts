import type {
  AutomationStatus,
  ExecutionAction,
  ExecutionOrchestrationState,
  ExecutionStatus,
  TaskSource,
} from '../interfaces/execution.types';

export class ExecutionSummaryResponseDto {
  id!: string;
  repositoryId!: string;
  orchestrationState!: ExecutionOrchestrationState;
  idempotencyKey!: string | null;
  publishPullRequest!: boolean;
  taskId!: string;
  taskExternalId!: string;
  taskTitle!: string;
  taskSource!: TaskSource;
  action!: ExecutionAction;
  status!: ExecutionStatus;
  automationStatus!: AutomationStatus;
  automationAttempts!: number;
  branchName!: string | null;
  commitSha!: string | null;
  pullRequestNumber!: number | null;
  pullRequestUrl!: string | null;
  pullRequestTitle!: string | null;
  automationErrorMessage!: string | null;
  automationCompletedAt!: Date | null;
  outputTruncated!: boolean;
  createdAt!: Date;
  startedAt!: Date | null;
  finishedAt!: Date | null;
}

export class ExecutionDetailResponseDto extends ExecutionSummaryResponseDto {
  output!: string;
  exitCode!: number | null;
  errorMessage!: string | null;
}
