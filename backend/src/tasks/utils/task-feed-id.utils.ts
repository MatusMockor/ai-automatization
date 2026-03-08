import type { TaskManagerProviderType } from '../../task-managers/interfaces/task-manager-provider.interface';

export type TaskFeedIdentity = {
  connectionId: string;
  provider: TaskManagerProviderType;
  externalId: string;
};

export function buildTaskFeedId(task: TaskFeedIdentity): string {
  return `${task.connectionId}:${task.provider}:${task.externalId}`;
}

export function buildManualTaskFeedId(taskId: string): string {
  return `manual:${taskId}`;
}

export function extractManualTaskId(taskId: string): string | null {
  if (!taskId.startsWith('manual:')) {
    return null;
  }

  const manualTaskId = taskId.slice('manual:'.length).trim();
  return manualTaskId.length > 0 ? manualTaskId : null;
}
