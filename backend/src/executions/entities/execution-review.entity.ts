import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { getTimestampColumnType } from '../../common/utils/database-column.utils';

const EXECUTION_REVIEW_DATETIME_COLUMN_TYPE = getTimestampColumnType();

export type ExecutionReviewVerdict = 'pass' | 'fail' | 'error';
export type ExecutionReviewDecision =
  | 'continue'
  | 'block'
  | 'fix'
  | 'timeout_continue';
export type ExecutionReviewStatus =
  | 'review_running'
  | 'awaiting_decision'
  | 'decision_continue'
  | 'decision_block'
  | 'remediation_running'
  | 'completed_pass'
  | 'completed_fail'
  | 'failed';

@Entity({ name: 'execution_reviews' })
@Index('IDX_execution_reviews_root_cycle', ['rootExecutionId', 'cycle'], {
  unique: true,
})
@Index('IDX_execution_reviews_parent_cycle', ['parentExecutionId', 'cycle'], {
  unique: true,
})
export class ExecutionReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'root_execution_id', type: 'uuid' })
  rootExecutionId!: string;

  @Column({ name: 'parent_execution_id', type: 'uuid' })
  parentExecutionId!: string;

  @Column({ type: 'integer' })
  cycle!: number;

  @Column({ name: 'review_execution_id', type: 'uuid' })
  reviewExecutionId!: string;

  @Column({ name: 'remediation_execution_id', type: 'uuid', nullable: true })
  remediationExecutionId!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  verdict!: ExecutionReviewVerdict | null;

  @Column({ name: 'findings_markdown', type: 'text', nullable: true })
  findingsMarkdown!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: ExecutionReviewStatus;

  @Column({ type: 'varchar', length: 16, nullable: true })
  decision!: ExecutionReviewDecision | null;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId!: string | null;

  @Column({
    name: 'decided_at',
    type: EXECUTION_REVIEW_DATETIME_COLUMN_TYPE,
    nullable: true,
  })
  decidedAt!: Date | null;

  @Column({
    name: 'pending_decision_until',
    type: EXECUTION_REVIEW_DATETIME_COLUMN_TYPE,
    nullable: true,
  })
  pendingDecisionUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
