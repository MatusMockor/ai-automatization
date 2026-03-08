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
import { User } from '../../users/entities/user.entity';

export type ManualTaskWorkflowState =
  | 'inbox'
  | 'drafted'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'archived';

@Entity({ name: 'manual_tasks' })
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
