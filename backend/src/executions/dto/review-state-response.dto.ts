import type { ReviewGateStatus } from '../interfaces/execution.types';

export class ReviewStateResponseDto {
  status!: ReviewGateStatus;
  cycle!: number | null;
  findingsMarkdown!: string | null;
  verdict!: 'pass' | 'fail' | 'error' | null;
  pendingDecisionUntil!: Date | null;
  reviewExecutionId!: string | null;
  remediationExecutionId!: string | null;
}
