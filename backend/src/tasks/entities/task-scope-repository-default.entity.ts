import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ManagedRepository } from '../../repositories/entities/repository.entity';
import type { TaskManagerProviderType } from '../../task-managers/interfaces/task-manager-provider.interface';
import { User } from '../../users/entities/user.entity';
import { SyncedTaskScopeType } from './synced-task-scope.entity';

@Entity({ name: 'task_scope_repository_defaults' })
@Unique('UQ_task_scope_repository_defaults_user_provider_scope', [
  'userId',
  'provider',
  'scopeType',
  'scopeId',
])
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
  provider!: TaskManagerProviderType;

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
