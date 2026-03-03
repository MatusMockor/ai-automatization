import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { SyncedTask } from './synced-task.entity';

export type SyncedTaskScopeType = 'asana_workspace' | 'jira_project';

@Entity({ name: 'synced_task_scopes' })
@Unique('UQ_synced_task_scopes_task_scope', ['taskId', 'scopeType', 'scopeId'])
@Index('IDX_synced_task_scopes_task_id', ['taskId'])
@Index('IDX_synced_task_scopes_scope_type_id', ['scopeType', 'scopeId'])
export class SyncedTaskScope {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @ManyToOne(() => SyncedTask, (task) => task.scopes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: SyncedTask;

  @Column({ name: 'scope_type', type: 'varchar', length: 32 })
  scopeType!: SyncedTaskScopeType;

  @Column({ name: 'scope_id', type: 'varchar', length: 128 })
  scopeId!: string;

  @Column({ name: 'scope_name', type: 'varchar', length: 255 })
  scopeName!: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;
}
