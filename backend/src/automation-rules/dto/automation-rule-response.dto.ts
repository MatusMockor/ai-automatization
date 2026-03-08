import type {
  ExecutionAction,
  TaskSource,
} from '../../executions/interfaces/execution.types';
import type { TaskItemStatus } from '../../task-managers/interfaces/task-manager-provider.interface';
import type {
  AutomationRuleMode,
  AutomationRuleScopeType,
} from '../entities/automation-rule.entity';

export class AutomationRuleResponseDto {
  id!: string;
  name!: string;
  enabled!: boolean;
  priority!: number;
  provider!: TaskSource;
  scopeType!: AutomationRuleScopeType | null;
  scopeId!: string | null;
  titleContains!: string[] | null;
  taskStatuses!: TaskItemStatus[] | null;
  repositoryId!: string;
  mode!: AutomationRuleMode;
  executionAction!: ExecutionAction | null;
  suggestedAction!: ExecutionAction | null;
  createdAt!: Date;
  updatedAt!: Date;
}
