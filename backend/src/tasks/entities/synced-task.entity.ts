import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { getTimestampColumnType } from '../../common/utils/database-column.utils';
import { TaskManagerConnection } from '../../task-managers/entities/task-manager-connection.entity';
import type {
  TaskItemStatus,
  TaskManagerProviderType,
} from '../../task-managers/interfaces/task-manager-provider.interface';
import { User } from '../../users/entities/user.entity';
import { SyncedTaskScope } from './synced-task-scope.entity';

const SYNCED_TASK_TIMESTAMP_COLUMN_TYPE = getTimestampColumnType();

@Entity({ name: 'synced_tasks' })
@Unique('UQ_synced_tasks_connection_external', ['connectionId', 'externalId'])
@Index('IDX_synced_tasks_user_provider', ['userId', 'provider'])
@Index('IDX_synced_tasks_connection_id', ['connectionId'])
@Index('IDX_synced_tasks_source_updated_at', ['sourceUpdatedAt'])
export class SyncedTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'connection_id', type: 'uuid' })
  connectionId!: string;

  @ManyToOne(() => TaskManagerConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection!: TaskManagerConnection;

  @Column({ type: 'varchar', length: 32 })
  provider!: TaskManagerProviderType;

  @Column({ name: 'external_id', type: 'varchar', length: 255 })
  externalId!: string;

  @Column({ type: 'varchar', length: 4000 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  url!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: TaskItemStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  assignee!: string | null;

  @Column({
    name: 'source_updated_at',
    type: SYNCED_TASK_TIMESTAMP_COLUMN_TYPE,
    nullable: true,
  })
  sourceUpdatedAt!: Date | null;

  @Column({
    name: 'last_synced_at',
    type: SYNCED_TASK_TIMESTAMP_COLUMN_TYPE,
  })
  lastSyncedAt!: Date;

  @OneToMany(() => SyncedTaskScope, (scope) => scope.task, {
    cascade: false,
  })
  scopes!: SyncedTaskScope[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
