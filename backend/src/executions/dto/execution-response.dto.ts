import type {
  AutomationStatus,
  ExecutionAction,
  ExecutionDraftStatus,
  ExecutionOrchestrationState,
  ExecutionRole,
  ExecutionStatus,
  ExecutionTriggerType,
  ReviewGateStatus,
  TaskSource,
} from '../interfaces/execution.types';

export class ExecutionSummaryResponseDto {
  id!: string;
  repositoryId!: string;
  orchestrationState!: ExecutionOrchestrationState;
  idempotencyKey!: string | null;
  publishPullRequest!: boolean;
  requireCodeChanges!: boolean;
  implementationAttempts!: number;
  taskId!: string;
  taskExternalId!: string;
  taskTitle!: string;
  taskSource!: TaskSource;
  action!: ExecutionAction;
  triggerType!: ExecutionTriggerType;
  executionRole!: ExecutionRole;
  parentExecutionId!: string | null;
  rootExecutionId!: string;
  originRuleId!: string | null;
  sourceTaskSnapshotUpdatedAt!: Date | null;
  isDraft!: boolean;
  draftStatus!: ExecutionDraftStatus | null;
  reviewGateStatus!: ReviewGateStatus;
  reviewPendingDecisionUntil!: Date | null;
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
