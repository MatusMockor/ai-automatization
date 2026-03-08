import type { TaskItemStatus } from '../../task-managers/interfaces/task-manager-provider.interface';
import type { ManualTaskWorkflowState } from '../entities/manual-task.entity';

export function mapManualWorkflowStateToTaskStatus(
  workflowState: ManualTaskWorkflowState,
): TaskItemStatus {
  switch (workflowState) {
    case 'in_progress':
      return 'in_progress';
    case 'done':
      return 'done';
    case 'archived':
      return 'closed';
    case 'blocked':
      return 'unknown';
    case 'drafted':
    case 'inbox':
    default:
      return 'open';
  }
}
