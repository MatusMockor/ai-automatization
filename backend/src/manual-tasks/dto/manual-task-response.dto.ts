import type { ManualTaskWorkflowState } from '../entities/manual-task.entity';

export class ManualTaskResponseDto {
  id!: string;
  title!: string;
  description!: string | null;
  workflowState!: ManualTaskWorkflowState;
  latestDraftExecutionId!: string | null;
  latestExecutionId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
