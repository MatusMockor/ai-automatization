import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutionStreamEventDto } from './dto/execution-stream-event.dto';
import { ExecutionEvent } from './entities/execution-event.entity';
import { ExecutionStreamEventType } from './interfaces/execution.types';

@Injectable()
export class ExecutionEventStoreService {
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
    await this.executionEventRepository.save(entity);

    return {
      type: event.type,
      payload: {
        ...event.payload,
        sequence: nextSequence,
        sentAt: createdAt.toISOString(),
      },
    } as ExecutionStreamEventDto;
  }
}
