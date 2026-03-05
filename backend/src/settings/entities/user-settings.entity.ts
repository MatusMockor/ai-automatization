import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { getJsonObjectColumnType } from '../../common/utils/database-column.utils';
import { User } from '../../users/entities/user.entity';
import type { PreCommitChecksProfile } from '../../executions/pre-commit/pre-commit-check-profile.types';

const JSON_COLUMN_TYPE = getJsonObjectColumnType();

@Entity({ name: 'user_settings' })
export class UserSettings {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'github_token', type: 'text', nullable: true })
  githubTokenEncrypted!: string | null;

  @Column({ name: 'claude_oauth_token', type: 'text', nullable: true })
  claudeOauthTokenEncrypted!: string | null;

  @Column({ name: 'execution_timeout_ms', type: 'integer', nullable: true })
  executionTimeoutMs!: number | null;

  @Column({
    name: 'pre_commit_checks_default',
    type: JSON_COLUMN_TYPE,
    nullable: true,
  })
  preCommitChecksDefault!: PreCommitChecksProfile | null;

  @Column({ name: 'ai_review_enabled', type: 'boolean', default: true })
  aiReviewEnabled!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
