import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { getJsonObjectColumnType } from '../../common/utils/database-column.utils';
import type {
  ExecutionAction,
  TaskSource,
} from '../../executions/interfaces/execution.types';
import { ManagedRepository } from '../../repositories/entities/repository.entity';
import type { TaskItemStatus } from '../../task-managers/interfaces/task-manager-provider.interface';
import { User } from '../../users/entities/user.entity';

const JSON_COLUMN_TYPE = getJsonObjectColumnType();

export type AutomationRuleScopeType =
  | 'asana_workspace'
  | 'asana_project'
  | 'jira_project';
export type AutomationRuleMode = 'suggest' | 'draft';

@Entity({ name: 'automation_rules' })
@Check(
  'CHK_automation_rules_scope_pair',
  `("scope_type" IS NULL AND "scope_id" IS NULL) OR ("scope_type" IS NOT NULL AND "scope_id" IS NOT NULL)`,
)
@Check(
  'CHK_automation_rules_provider',
  `provider IN ('asana', 'jira', 'manual')`,
)
@Check(
  'CHK_automation_rules_scope_type',
  `scope_type IS NULL OR scope_type IN ('asana_workspace', 'asana_project', 'jira_project')`,
)
@Check(
  'CHK_automation_rules_provider_scope_compat',
  `scope_type IS NULL OR (provider = 'asana' AND scope_type IN ('asana_workspace', 'asana_project')) OR (provider = 'jira' AND scope_type = 'jira_project')`,
)
@Check(
  'CHK_automation_rules_suggested_action',
  `suggested_action IS NULL OR suggested_action IN ('fix', 'feature', 'plan')`,
)
@Check('CHK_automation_rules_mode', `mode IN ('suggest', 'draft')`)
@Check(
  'CHK_automation_rules_draft_action_required',
  `mode <> 'draft' OR suggested_action IS NOT NULL`,
)
@Index('IDX_automation_rules_user_provider_enabled', [
  'userId',
  'provider',
  'enabled',
])
@Index('IDX_automation_rules_user_priority', ['userId', 'priority'])
@Index('IDX_automation_rules_repository_id', ['repositoryId'])
export class AutomationRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'integer', default: 0 })
  priority!: number;

  @Column({ type: 'varchar', length: 32 })
  provider!: TaskSource;

  @Column({ name: 'scope_type', type: 'varchar', length: 32, nullable: true })
  scopeType!: AutomationRuleScopeType | null;

  @Column({ name: 'scope_id', type: 'varchar', length: 128, nullable: true })
  scopeId!: string | null;

  @Column({ name: 'title_contains', type: JSON_COLUMN_TYPE, nullable: true })
  titleContains!: string[] | null;

  @Column({ name: 'task_statuses', type: JSON_COLUMN_TYPE, nullable: true })
  taskStatuses!: TaskItemStatus[] | null;

  @Column({ name: 'repository_id', type: 'uuid' })
  repositoryId!: string;

  @ManyToOne(() => ManagedRepository, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repository_id' })
  repository!: ManagedRepository;

  @Column({ type: 'varchar', length: 16, default: 'suggest' })
  mode!: AutomationRuleMode;

  @Column({
    name: 'suggested_action',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  suggestedAction!: ExecutionAction | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
