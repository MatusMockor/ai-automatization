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

export type TaskAutomationControlType = 'snooze' | 'dismiss_until_change';

const TASK_AUTOMATION_CONTROL_TIMESTAMP_TYPE = getTimestampColumnType();

@Entity({ name: 'task_automation_controls' })
@Check(
  'CHK_task_automation_controls_type',
  `"control_type" IN ('snooze', 'dismiss_until_change')`,
)
@Index('UQ_task_automation_controls_user_task_key', ['userId', 'taskKey'], {
  unique: true,
})
@Index('IDX_task_automation_controls_user_active', ['userId', 'isActive'])
export class TaskAutomationControl {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'task_key', type: 'varchar', length: 512 })
  taskKey!: string;

  @Column({ name: 'control_type', type: 'varchar', length: 32 })
  controlType!: TaskAutomationControlType;

  @Column({
    name: 'until_at',
    type: TASK_AUTOMATION_CONTROL_TIMESTAMP_TYPE,
    nullable: true,
  })
  untilAt!: Date | null;

  @Column({
    name: 'source_version',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  sourceVersion!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({
    name: 'suppressed_at',
    type: TASK_AUTOMATION_CONTROL_TIMESTAMP_TYPE,
    nullable: true,
  })
  suppressedAt!: Date | null;

  @Column({
    name: 'restored_at',
    type: TASK_AUTOMATION_CONTROL_TIMESTAMP_TYPE,
    nullable: true,
  })
  restoredAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
