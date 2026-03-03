import type { TaskManagerProviderType } from '../../task-managers/interfaces/task-manager-provider.interface';

export class TaskRepositoryDefaultItemDto {
  id!: string;
  provider!: TaskManagerProviderType;
  scopeType!: 'asana_project' | 'asana_workspace' | 'jira_project' | null;
  scopeId!: string | null;
  repositoryId!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class TaskRepositoryDefaultsResponseDto {
  items!: TaskRepositoryDefaultItemDto[];
}
