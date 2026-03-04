import { TaskSyncRunStatus } from '../entities/task-sync-run.entity';

export class StartTaskSyncResponseDto {
  runId!: string;
  status!: Extract<TaskSyncRunStatus, 'queued' | 'running'>;
}
