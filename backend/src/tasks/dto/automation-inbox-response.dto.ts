import type {
  ExecutionAction,
  ExecutionDraftStatus,
  ExecutionGroupStatus,
  ExecutionStatus,
  TaskAutomationMode,
  TaskAutomationState,
  TaskSource,
} from '../../executions/interfaces/execution.types';
import type { ManualTaskWorkflowState } from '../../manual-tasks/entities/manual-task.entity';
import type { TaskItemStatus } from '../../task-managers/interfaces/task-manager-provider.interface';
import type { RepositorySelectionSource } from '../task-repository-defaults.service';

export type AutomationInboxReasonCode =
  | 'draft_ready'
  | 'draft_superseded'
  | 'matched_rule_no_draft'
  | 'no_repository_selected'
  | 'blocked_by_execution_failure'
  | 'dismissed_until_change'
  | 'snoozed';

export type AutomationInboxNextAction =
  | 'start_draft'
  | 'supersede_draft'
  | 'edit_rule'
  | 'assign_repository'
  | 'none';

export class AutomationInboxItemDto {
  taskKey!: string;
  taskId!: string;
  source!: TaskSource;
  title!: string;
  status!: TaskItemStatus;
  updatedAt!: string;
  manualWorkflowState!: ManualTaskWorkflowState | null;
  matchedRuleId!: string | null;
  matchedRuleName!: string | null;
  suggestedRepositoryId!: string | null;
  repositorySelectionSource!: RepositorySelectionSource;
  suggestedAction!: ExecutionAction | null;
  automationMode!: TaskAutomationMode | null;
  automationState!: TaskAutomationState;
  draftExecutionId!: string | null;
  draftStatus!: ExecutionDraftStatus | null;
  executionGroupId!: string | null;
  groupStatus!: ExecutionGroupStatus | null;
  groupRepositoryIds!: string[];
  coordinatedDraftCount!: number;
  latestExecutionId!: string | null;
  latestExecutionStatus!: ExecutionStatus | null;
  reasonCode!: AutomationInboxReasonCode;
  reasonText!: string;
  nextAction!: AutomationInboxNextAction;
}

export class AutomationInboxResponseDto {
  total!: number;
  items!: AutomationInboxItemDto[];
}
