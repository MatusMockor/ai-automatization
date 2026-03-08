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
import { ManagedRepository } from '../../repositories/entities/repository.entity';
import { User } from '../../users/entities/user.entity';
import { getTimestampColumnType } from '../../common/utils/database-column.utils';
import type {
  AutomationStatus,
  ExecutionAction,
  ExecutionDraftStatus,
  ExecutionOrchestrationState,
  ExecutionRole,
  ExecutionStatus,
  ExecutionTriggerType,
  ReviewGateStatus,
  TaskSource,
} from '../interfaces/execution.types';

const EXECUTION_DATETIME_COLUMN_TYPE = getTimestampColumnType();

@Entity({ name: 'executions' })
@Index('IDX_executions_user_created_at', ['userId', 'createdAt'])
@Index('IDX_executions_user_status', ['userId', 'status'])
@Index('IDX_executions_user_task_draft', ['userId', 'taskId', 'isDraft'])
export class Execution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'repository_id', type: 'uuid' })
  repositoryId!: string;

  @ManyToOne(() => ManagedRepository, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repository_id' })
  repository!: ManagedRepository;

  @Column({ name: 'publish_pull_request', type: 'boolean', default: true })
  publishPullRequest!: boolean;

  @Column({ name: 'require_code_changes', type: 'boolean', default: true })
  requireCodeChanges!: boolean;

  @Column({ name: 'implementation_attempts', type: 'integer', default: 1 })
  implementationAttempts!: number;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  idempotencyKey!: string | null;

  @Column({ name: 'request_hash', type: 'varchar', length: 64, nullable: true })
  requestHash!: string | null;

  @Column({
    name: 'orchestration_state',
    type: 'varchar',
    length: 16,
    default: 'queued',
  })
  orchestrationState!: ExecutionOrchestrationState;

  @Column({ name: 'task_id', type: 'varchar', length: 255 })
  taskId!: string;

  @Column({ name: 'task_external_id', type: 'varchar', length: 255 })
  taskExternalId!: string;

  @Column({ name: 'task_title', type: 'text' })
  taskTitle!: string;

  @Column({ name: 'task_description', type: 'text', nullable: true })
  taskDescription!: string | null;

  @Column({ name: 'task_source', type: 'varchar', length: 16 })
  taskSource!: TaskSource;

  @Column({ type: 'varchar', length: 16 })
  action!: ExecutionAction;

  @Column({
    name: 'trigger_type',
    type: 'varchar',
    length: 32,
    default: 'manual',
  })
  triggerType!: ExecutionTriggerType;

  @Column({
    name: 'execution_role',
    type: 'varchar',
    length: 16,
    default: 'implementation',
  })
  executionRole!: ExecutionRole;

  @Column({ name: 'parent_execution_id', type: 'uuid', nullable: true })
  parentExecutionId!: string | null;

  @Column({ name: 'root_execution_id', type: 'uuid' })
  rootExecutionId!: string;

  @Column({ name: 'origin_rule_id', type: 'uuid', nullable: true })
  originRuleId!: string | null;

  @Column({
    name: 'source_task_snapshot_updated_at',
    type: EXECUTION_DATETIME_COLUMN_TYPE,
    nullable: true,
  })
  sourceTaskSnapshotUpdatedAt!: Date | null;

  @Column({ name: 'is_draft', type: 'boolean', default: false })
  isDraft!: boolean;

  @Column({
    name: 'draft_status',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  draftStatus!: ExecutionDraftStatus | null;

  @Column({
    name: 'review_gate_status',
    type: 'varchar',
    length: 32,
    default: 'not_applicable',
  })
  reviewGateStatus!: ReviewGateStatus;

  @Column({
    name: 'review_pending_decision_until',
    type: EXECUTION_DATETIME_COLUMN_TYPE,
    nullable: true,
  })
  reviewPendingDecisionUntil!: Date | null;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: ExecutionStatus;

  @Column({
    name: 'automation_status',
    type: 'varchar',
    length: 24,
    default: 'pending',
  })
  automationStatus!: AutomationStatus;

  @Column({ name: 'automation_attempts', type: 'integer', default: 0 })
  automationAttempts!: number;

  @Column({ name: 'branch_name', type: 'varchar', length: 255, nullable: true })
  branchName!: string | null;

  @Column({ name: 'commit_sha', type: 'varchar', length: 64, nullable: true })
  commitSha!: string | null;

  @Column({ name: 'pull_request_number', type: 'integer', nullable: true })
  pullRequestNumber!: number | null;

  @Column({ name: 'pull_request_url', type: 'text', nullable: true })
  pullRequestUrl!: string | null;

  @Column({ name: 'pull_request_title', type: 'text', nullable: true })
  pullRequestTitle!: string | null;

  @Column({ name: 'automation_error_message', type: 'text', nullable: true })
  automationErrorMessage!: string | null;

  @Column({
    name: 'automation_completed_at',
    type: EXECUTION_DATETIME_COLUMN_TYPE,
    nullable: true,
  })
  automationCompletedAt!: Date | null;

  @Column({ type: 'text', default: '' })
  output!: string;

  @Column({ name: 'output_truncated', type: 'boolean', default: false })
  outputTruncated!: boolean;

  @Column({ type: 'integer', nullable: true })
  pid!: number | null;

  @Column({
    name: 'started_at',
    type: EXECUTION_DATETIME_COLUMN_TYPE,
    nullable: true,
  })
  startedAt!: Date | null;

  @Column({
    name: 'finished_at',
    type: EXECUTION_DATETIME_COLUMN_TYPE,
    nullable: true,
  })
  finishedAt!: Date | null;

  @Column({ name: 'exit_code', type: 'integer', nullable: true })
  exitCode!: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
