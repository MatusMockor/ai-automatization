import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'user_settings' })
export class UserSettings {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'github_token', type: 'text', nullable: true })
  githubTokenEncrypted!: string | null;

  @Column({ name: 'claude_api_key', type: 'text', nullable: true })
  claudeApiKeyEncrypted!: string | null;

  @Column({ name: 'execution_timeout_ms', type: 'integer', nullable: true })
  executionTimeoutMs!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
