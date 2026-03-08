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
import { ManagedRepository } from '../../repositories/entities/repository.entity';
import type { TaskSource } from '../../executions/interfaces/execution.types';
import { User } from '../../users/entities/user.entity';
import { SyncedTaskScopeType } from './synced-task-scope.entity';

@Entity({ name: 'task_scope_repository_defaults' })
@Check(
  'CHK_task_scope_repo_defaults_provider',
  `provider IN ('asana', 'jira', 'manual')`,
)
@Check(
  'CHK_task_scope_repo_defaults_scope_type',
  `scope_type IS NULL OR scope_type IN ('asana_workspace', 'asana_project', 'jira_project')`,
)
@Check(
  'CHK_task_scope_repo_defaults_scope_pair',
  `("scope_type" IS NULL AND "scope_id" IS NULL) OR ("scope_type" IS NOT NULL AND "scope_id" IS NOT NULL)`,
)
@Check(
  'CHK_task_scope_repo_defaults_provider_scope_compat',
  `scope_type IS NULL OR (provider = 'asana' AND scope_type IN ('asana_workspace', 'asana_project')) OR (provider = 'jira' AND scope_type = 'jira_project')`,
)
@Index('UQ_task_scope_repo_defaults_provider_default', ['userId', 'provider'], {
  unique: true,
  where: `"scope_type" IS NULL AND "scope_id" IS NULL`,
})
@Index(
  'UQ_task_scope_repository_defaults_user_provider_scope',
  ['userId', 'provider', 'scopeType', 'scopeId'],
  {
    unique: true,
    where: `"scope_type" IS NOT NULL AND "scope_id" IS NOT NULL`,
  },
)
@Index('IDX_task_scope_repo_defaults_user_provider', ['userId', 'provider'])
export class TaskScopeRepositoryDefault {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 32 })
  provider!: TaskSource;

  @Column({ name: 'scope_type', type: 'varchar', length: 32, nullable: true })
  scopeType!: SyncedTaskScopeType | null;

  @Column({ name: 'scope_id', type: 'varchar', length: 128, nullable: true })
  scopeId!: string | null;

  @Column({ name: 'repository_id', type: 'uuid' })
  repositoryId!: string;

  @ManyToOne(() => ManagedRepository, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repository_id' })
  repository!: ManagedRepository;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
