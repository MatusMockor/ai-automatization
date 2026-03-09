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
  const normalizedTaskId = taskId.trim();
  if (normalizedTaskId.length === 0) {
    throw new Error('Manual task id must not be empty');
  }

  return `manual:${normalizedTaskId}`;
}

export function extractManualTaskId(taskId: string): string | null {
  if (!taskId.startsWith('manual:')) {
    return null;
  }

  const manualTaskId = taskId.slice('manual:'.length).trim();
  return manualTaskId.length > 0 ? manualTaskId : null;
}

export function extractTaskFeedIdentity(
  taskId: string,
): TaskFeedIdentity | null {
  const firstSeparatorIndex = taskId.indexOf(':');
  if (firstSeparatorIndex <= 0) {
    return null;
  }

  const secondSeparatorIndex = taskId.indexOf(':', firstSeparatorIndex + 1);
  if (secondSeparatorIndex <= firstSeparatorIndex + 1) {
    return null;
  }

  const connectionId = taskId.slice(0, firstSeparatorIndex).trim();
  const provider = taskId.slice(
    firstSeparatorIndex + 1,
    secondSeparatorIndex,
  ) as TaskManagerProviderType;
  const externalId = taskId.slice(secondSeparatorIndex + 1).trim();

  if (
    connectionId.length === 0 ||
    externalId.length === 0 ||
    (provider !== 'asana' && provider !== 'jira')
  ) {
    return null;
  }

  return {
    connectionId,
    provider,
    externalId,
  };
}
