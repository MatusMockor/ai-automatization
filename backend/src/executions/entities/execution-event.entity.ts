import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Execution } from './execution.entity';

@Entity({ name: 'execution_events' })
@Index('IDX_execution_events_execution_created_at', [
  'executionId',
  'createdAt',
])
@Index('IDX_execution_events_created_at', ['createdAt'])
@Index('UQ_execution_events_execution_sequence', ['executionId', 'sequence'], {
  unique: true,
})
export class ExecutionEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'execution_id', type: 'uuid' })
  executionId!: string;

  @ManyToOne(() => Execution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'execution_id' })
  execution!: Execution;

  @Column({ name: 'sequence', type: 'integer' })
  sequence!: number;

  @Column({ name: 'event_type', type: 'varchar', length: 32 })
  eventType!: string;

  @Column({ name: 'payload_json', type: 'text' })
  payloadJson!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
