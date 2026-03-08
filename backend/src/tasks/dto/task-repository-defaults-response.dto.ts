import type { TaskSource } from '../../executions/interfaces/execution.types';

export class TaskRepositoryDefaultItemDto {
  id!: string;
  provider!: TaskSource;
  scopeType!: 'asana_project' | 'asana_workspace' | 'jira_project' | null;
  scopeId!: string | null;
  repositoryId!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class TaskRepositoryDefaultsResponseDto {
  items!: TaskRepositoryDefaultItemDto[];
}
