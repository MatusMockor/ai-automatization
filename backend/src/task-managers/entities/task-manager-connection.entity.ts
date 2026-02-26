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
import { User } from '../../users/entities/user.entity';
import { TaskPrefix } from './task-prefix.entity';

const LAST_VALIDATED_AT_COLUMN_TYPE =
  process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';

@Entity({ name: 'task_manager_connections' })
@Unique('UQ_task_manager_connections_user_provider_scope', [
  'userId',
  'provider',
  'scopeKey',
])
@Index('IDX_task_manager_connections_user_id', ['userId'])
export class TaskManagerConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name!: string | null;

  @Column({ name: 'scope_key', type: 'varchar', length: 255 })
  scopeKey!: string;

  @Column({ name: 'base_url', type: 'text', nullable: true })
  baseUrl!: string | null;

  @Column({
    name: 'workspace_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  workspaceId!: string | null;

  @Column({ name: 'project_id', type: 'varchar', length: 128, nullable: true })
  projectId!: string | null;

  @Column({ name: 'project_key', type: 'varchar', length: 64, nullable: true })
  projectKey!: string | null;

  @Column({ name: 'auth_mode', type: 'varchar', length: 16, nullable: true })
  authMode!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'secret_encrypted', type: 'text' })
  secretEncrypted!: string;

  @Column({ type: 'varchar', length: 16, default: 'connected' })
  status!: string;

  @Column({
    name: 'last_validated_at',
    type: LAST_VALIDATED_AT_COLUMN_TYPE,
    nullable: true,
  })
  lastValidatedAt!: Date | null;

  @OneToMany(() => TaskPrefix, (prefix) => prefix.connection, {
    cascade: false,
  })
  prefixes!: TaskPrefix[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
