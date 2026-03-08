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
import { getTimestampColumnType } from '../../common/utils/database-column.utils';
import { User } from '../../users/entities/user.entity';

export type ManualTaskWorkflowState =
  | 'inbox'
  | 'drafted'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'archived';

const MANUAL_TASK_TIMESTAMP_COLUMN_TYPE = getTimestampColumnType();

@Entity({ name: 'manual_tasks' })
@Check(
  'CHK_manual_tasks_workflow_state',
  `"workflow_state" IS NOT NULL AND "workflow_state" IN ('inbox', 'drafted', 'in_progress', 'blocked', 'done', 'archived')`,
)
@Index('IDX_manual_tasks_user_id', ['userId'])
export class ManualTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 4000 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    name: 'content_updated_at',
    type: MANUAL_TASK_TIMESTAMP_COLUMN_TYPE,
    default: () => 'CURRENT_TIMESTAMP',
  })
  contentUpdatedAt!: Date;

  @Column({
    name: 'workflow_state',
    type: 'varchar',
    length: 32,
    default: 'inbox',
  })
  workflowState!: ManualTaskWorkflowState;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
