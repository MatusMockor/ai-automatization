import type { TaskManagerProviderType } from '../../task-managers/interfaces/task-manager-provider.interface';
import {
  TaskSyncRunStatus,
  TaskSyncTriggerType,
} from '../entities/task-sync-run.entity';

export class StartTaskSyncResponseDto {
  runId!: string;
  status!: Extract<TaskSyncRunStatus, 'queued' | 'running'>;
  provider!: TaskManagerProviderType;
  triggerType!: Exclude<TaskSyncTriggerType, 'webhook'>;
}
