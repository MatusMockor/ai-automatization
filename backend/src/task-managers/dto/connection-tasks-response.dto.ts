import type {
  TaskItemStatus,
  TaskManagerProviderType,
} from '../interfaces/task-manager-provider.interface';

export class ConnectionTaskItemDto {
  id!: string;
  externalId!: string;
  title!: string;
  description!: string;
  url!: string;
  status!: TaskItemStatus;
  assignee!: string | null;
  source!: TaskManagerProviderType;
  updatedAt!: string;
}

export class ConnectionTasksResponseDto {
  connectionId!: string;
  provider!: TaskManagerProviderType;
  total!: number;
  items!: ConnectionTaskItemDto[];
}
