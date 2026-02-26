import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'repositories' })
@Unique('UQ_repositories_user_full_name', ['userId', 'fullName'])
@Index('IDX_repositories_user_id', ['userId'])
export class ManagedRepository {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column({ name: 'clone_url', type: 'text' })
  cloneUrl!: string;

  @Column({ name: 'default_branch', type: 'varchar', length: 255 })
  defaultBranch!: string;

  @Column({ name: 'local_path', type: 'text' })
  localPath!: string;

  @Column({ name: 'is_cloned', type: 'boolean', default: false })
  isCloned!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
