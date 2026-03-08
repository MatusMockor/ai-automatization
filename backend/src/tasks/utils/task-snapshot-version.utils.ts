import { SyncedTask } from '../entities/synced-task.entity';
import { ManualTask } from '../../manual-tasks/entities/manual-task.entity';

type TaskSnapshotVersionSource = Pick<SyncedTask, 'sourceUpdatedAt'>;
type ManualTaskSnapshotVersionSource = Pick<ManualTask, 'contentUpdatedAt'>;

export function resolveTaskSnapshotVersion(
  task: TaskSnapshotVersionSource,
): Date | null {
  return task.sourceUpdatedAt ?? null;
}

export function resolveManualTaskSnapshotVersion(
  task: ManualTaskSnapshotVersionSource,
): Date {
  return task.contentUpdatedAt;
}
