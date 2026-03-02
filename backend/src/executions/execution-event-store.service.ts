import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ExecutionStreamEventDto } from './dto/execution-stream-event.dto';
import { ExecutionEvent } from './entities/execution-event.entity';
import { ExecutionStreamEventType } from './interfaces/execution.types';

@Injectable()
export class ExecutionEventStoreService {
  private static readonly MAX_SEQUENCE_RETRIES = 5;

  constructor(
    @InjectRepository(ExecutionEvent)
    private readonly executionEventRepository: Repository<ExecutionEvent>,
  ) {}

  async getLastSequence(executionId: string): Promise<number> {
    const lastEvent = await this.executionEventRepository.findOne({
      where: { executionId },
      order: { sequence: 'DESC' },
    });

    return lastEvent?.sequence ?? 0;
  }

  async listAfterSequence(
    executionId: string,
    afterSequence: number,
  ): Promise<ExecutionStreamEventDto[]> {
    const rows = await this.executionEventRepository
      .createQueryBuilder('event')
      .where('event.execution_id = :executionId', { executionId })
      .andWhere('event.sequence > :afterSequence', { afterSequence })
      .orderBy('event.sequence', 'ASC')
      .getMany();

    return rows.map((row): ExecutionStreamEventDto => {
      const payload = JSON.parse(
        row.payloadJson,
      ) as ExecutionStreamEventDto['payload'];

      return {
        type: row.eventType as ExecutionStreamEventType,
        payload: {
          ...payload,
          sequence: row.sequence,
          sentAt: row.createdAt.toISOString(),
        },
      } as ExecutionStreamEventDto;
    });
  }

  async append(
    executionId: string,
    event: ExecutionStreamEventDto,
  ): Promise<ExecutionStreamEventDto> {
    for (
      let attempt = 0;
      attempt < ExecutionEventStoreService.MAX_SEQUENCE_RETRIES;
      attempt += 1
    ) {
      const currentSequence = await this.getLastSequence(executionId);
      const nextSequence = currentSequence + 1;
      const createdAt = new Date();

      const entity = this.executionEventRepository.create({
        executionId,
        sequence: nextSequence,
        eventType: event.type,
        payloadJson: JSON.stringify(event.payload),
        createdAt,
      });

      try {
        await this.executionEventRepository.save(entity);
      } catch (error) {
        const isLastAttempt =
          attempt === ExecutionEventStoreService.MAX_SEQUENCE_RETRIES - 1;
        if (!this.isSequenceConflictError(error) || isLastAttempt) {
          throw error;
        }
        continue;
      }

      return {
        type: event.type,
        payload: {
          ...event.payload,
          sequence: nextSequence,
          sentAt: createdAt.toISOString(),
        },
      } as ExecutionStreamEventDto;
    }

    throw new Error(
      `Unable to persist execution event sequence for ${executionId}`,
    );
  }

  private isSequenceConflictError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const pgCode = (error as QueryFailedError & { code?: string }).code;
    if (pgCode === '23505') {
      return true;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('uq_execution_events_execution_sequence') ||
      (message.includes('execution_events.execution_id') &&
        message.includes('execution_events.sequence'))
    );
  }
}
