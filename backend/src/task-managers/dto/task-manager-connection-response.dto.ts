import type { TaskManagerProviderType } from '../interfaces/task-manager-provider.interface';
import { TaskPrefixResponseDto } from './task-prefix-response.dto';

export class TaskManagerConnectionResponseDto {
  id!: string;
  provider!: TaskManagerProviderType;
  name!: string | null;
  status!: string;
  baseUrl!: string | null;
  workspaceId!: string | null;
  projectId!: string | null;
  projectKey!: string | null;
  hasSecret!: boolean;
  lastValidatedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  prefixes!: TaskPrefixResponseDto[];
}
