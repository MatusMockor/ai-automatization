import type { TaskManagerProviderType } from '../../task-managers/interfaces/task-manager-provider.interface';

export type TaskFeedIdentity = {
  connectionId: string;
  provider: TaskManagerProviderType;
  externalId: string;
};

export function buildTaskFeedId(task: TaskFeedIdentity): string {
  return `${task.connectionId}:${task.provider}:${task.externalId}`;
}
