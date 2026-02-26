import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TaskManagerConnection } from './task-manager-connection.entity';

@Entity({ name: 'task_prefixes' })
@Unique('UQ_task_prefixes_connection_normalized', [
  'connectionId',
  'normalizedValue',
])
@Index('IDX_task_prefixes_connection_id', ['connectionId'])
export class TaskPrefix {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'connection_id', type: 'uuid' })
  connectionId!: string;

  @ManyToOne(() => TaskManagerConnection, (connection) => connection.prefixes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'connection_id' })
  connection!: TaskManagerConnection;

  @Column({ type: 'varchar', length: 64 })
  value!: string;

  @Column({ name: 'normalized_value', type: 'varchar', length: 64 })
  normalizedValue!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
