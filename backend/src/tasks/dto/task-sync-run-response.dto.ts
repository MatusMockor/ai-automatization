import type { TaskManagerProviderType } from '../../task-managers/interfaces/task-manager-provider.interface';
import {
  TaskSyncRunStatus,
  TaskSyncTriggerType,
} from '../entities/task-sync-run.entity';

export class TaskSyncRunResponseDto {
  id!: string;
  status!: TaskSyncRunStatus;
  provider!: TaskManagerProviderType | null;
  triggerType!: TaskSyncTriggerType;
  connectionsTotal!: number;
  connectionsDone!: number;
  tasksUpserted!: number;
  tasksDeleted!: number;
  errorMessage!: string | null;
  startedAt!: Date | null;
  finishedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
