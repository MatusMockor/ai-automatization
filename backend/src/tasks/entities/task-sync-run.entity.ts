import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { getTimestampColumnType } from '../../common/utils/database-column.utils';
import { User } from '../../users/entities/user.entity';

const TASK_SYNC_RUN_TIMESTAMP_COLUMN_TYPE = getTimestampColumnType();

export type TaskSyncRunStatus = 'queued' | 'running' | 'completed' | 'failed';

@Entity({ name: 'task_sync_runs' })
@Index('IDX_task_sync_runs_user_id', ['userId'])
export class TaskSyncRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 16 })
  status!: TaskSyncRunStatus;

  @Column({ name: 'connections_total', type: 'integer', default: 0 })
  connectionsTotal!: number;

  @Column({ name: 'connections_done', type: 'integer', default: 0 })
  connectionsDone!: number;

  @Column({ name: 'tasks_upserted', type: 'integer', default: 0 })
  tasksUpserted!: number;

  @Column({ name: 'tasks_deleted', type: 'integer', default: 0 })
  tasksDeleted!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({
    name: 'started_at',
    type: TASK_SYNC_RUN_TIMESTAMP_COLUMN_TYPE,
    nullable: true,
  })
  startedAt!: Date | null;

  @Column({
    name: 'finished_at',
    type: TASK_SYNC_RUN_TIMESTAMP_COLUMN_TYPE,
    nullable: true,
  })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
