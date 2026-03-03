import type {
  TaskItemStatus,
  TaskManagerProviderType,
} from '../../task-managers/interfaces/task-manager-provider.interface';

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
  source!: TaskManagerProviderType;
  matchedPrefix!: string | null;
  primaryScopeType!: 'asana_workspace' | 'jira_project' | null;
  primaryScopeId!: string | null;
  primaryScopeName!: string | null;
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
  appliedPrefixes!: string[];
  total!: number;
  items!: TaskFeedItemDto[];
  errors!: TaskFeedConnectionErrorDto[];
}
