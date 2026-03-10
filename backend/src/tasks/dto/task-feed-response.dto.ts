import type {
  ExecutionAction,
  ExecutionDraftStatus,
  ExecutionGroupStatus,
  TaskAutomationMode,
  TaskAutomationState,
  TaskSource,
} from '../../executions/interfaces/execution.types';
import type {
  TaskItemStatus,
  TaskManagerProviderType,
} from '../../task-managers/interfaces/task-manager-provider.interface';
import type { ManualTaskWorkflowState } from '../../manual-tasks/entities/manual-task.entity';

export type TaskFeedErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'bad_gateway'
  | 'unknown';

export class TaskFeedItemDto {
  id!: string;
  connectionId!: string;
  externalId!: string;
  title!: string;
  description!: string;
  url!: string;
  status!: TaskItemStatus;
  assignee!: string | null;
  source!: TaskSource;
  primaryScopeType!:
    | 'asana_workspace'
    | 'asana_project'
    | 'jira_project'
    | null;
  primaryScopeId!: string | null;
  primaryScopeName!: string | null;
  suggestedRepositoryId!: string | null;
  repositorySelectionSource!:
    | 'automation_rule'
    | 'asana_project'
    | 'asana_workspace'
    | 'jira_project'
    | 'provider_default'
    | null;
  matchedRuleId!: string | null;
  matchedRuleName!: string | null;
  suggestedAction!: ExecutionAction | null;
  automationMode!: TaskAutomationMode | null;
  draftExecutionId!: string | null;
  draftStatus!: ExecutionDraftStatus | null;
  executionGroupId!: string | null;
  groupStatus!: ExecutionGroupStatus | null;
  groupRepositoryIds!: string[];
  coordinatedDraftCount!: number;
  automationState!: TaskAutomationState;
  manualWorkflowState!: ManualTaskWorkflowState | null;
  hasMultipleScopes!: boolean;
  updatedAt!: string;
}

export class TaskFeedConnectionErrorDto {
  connectionId!: string;
  provider!: TaskManagerProviderType;
  statusCode!: number;
  code!: TaskFeedErrorCode;
  message!: string;
}

export class TaskFeedResponseDto {
  repositoryId!: string | null;
  total!: number;
  items!: TaskFeedItemDto[];
  errors!: TaskFeedConnectionErrorDto[];
}
