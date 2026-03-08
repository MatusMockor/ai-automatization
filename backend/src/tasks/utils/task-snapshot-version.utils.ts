import { SyncedTask } from '../entities/synced-task.entity';

type TaskSnapshotVersionSource = Pick<SyncedTask, 'sourceUpdatedAt'>;

export function resolveTaskSnapshotVersion(
  task: TaskSnapshotVersionSource,
): Date | null {
  return task.sourceUpdatedAt ?? null;
}
