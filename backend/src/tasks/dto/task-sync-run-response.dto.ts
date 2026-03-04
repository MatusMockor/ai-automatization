import { TaskSyncRunStatus } from '../entities/task-sync-run.entity';

export class TaskSyncRunResponseDto {
  id!: string;
  status!: TaskSyncRunStatus;
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
