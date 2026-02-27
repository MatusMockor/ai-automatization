import type {
  ExecutionAction,
  ExecutionStatus,
  TaskSource,
} from '../interfaces/execution.types';

export class ExecutionSummaryResponseDto {
  id!: string;
  repositoryId!: string;
  taskId!: string;
  taskExternalId!: string;
  taskTitle!: string;
  taskSource!: TaskSource;
  action!: ExecutionAction;
  status!: ExecutionStatus;
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
