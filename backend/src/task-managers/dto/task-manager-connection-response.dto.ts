import type {
  ConnectionStatus,
  TaskManagerProviderType,
} from '../interfaces/task-manager-provider.interface';

export class TaskManagerConnectionResponseDto {
  id!: string;
  provider!: TaskManagerProviderType;
  name!: string | null;
  status!: ConnectionStatus;
  baseUrl!: string | null;
  workspaceId!: string | null;
  projectId!: string | null;
  projectKey!: string | null;
  hasSecret!: boolean;
  lastValidatedAt!: Date | null;
  lastSyncedAt!: Date | null;
  lastSyncStatus!: string | null;
  lastSyncError!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
