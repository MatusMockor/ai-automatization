import type { ExecutionAction } from '../../executions/interfaces/execution.types';
import type { TaskItemStatus } from '../../task-managers/interfaces/task-manager-provider.interface';
import type { AutomationRuleScopeType } from '../entities/automation-rule.entity';

export class AutomationRuleResponseDto {
  id!: string;
  name!: string;
  enabled!: boolean;
  priority!: number;
  provider!: 'asana' | 'jira';
  scopeType!: AutomationRuleScopeType | null;
  scopeId!: string | null;
  titleContains!: string[] | null;
  taskStatuses!: TaskItemStatus[] | null;
  repositoryId!: string;
  suggestedAction!: ExecutionAction | null;
  createdAt!: Date;
  updatedAt!: Date;
}
