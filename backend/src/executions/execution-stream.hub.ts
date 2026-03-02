import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { ExecutionEventStoreService } from './execution-event-store.service';
import { ExecutionStreamEventDto } from './dto/execution-stream-event.dto';

@Injectable()
export class ExecutionStreamHub {
  private readonly logger = new Logger(ExecutionStreamHub.name);
  private readonly channels = new Map<string, Set<Subject<MessageEvent>>>();
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly executionEventStoreService: ExecutionEventStoreService,
  ) {}

  createStream(
    executionId: string,
    snapshotEvent: ExecutionStreamEventDto,
    completeImmediately: boolean,
    replayEvents: ExecutionStreamEventDto[] = [],
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const subject = new Subject<MessageEvent>();
      this.registerSubscriber(executionId, subject);

      const subscription = subject.subscribe({
        next: (event) => subscriber.next(event),
        error: (error) => subscriber.error(error),
        complete: () => subscriber.complete(),
      });

      subscriber.next(this.toMessageEvent(snapshotEvent));
      for (const replayEvent of replayEvents) {
        subscriber.next(this.toMessageEvent(replayEvent));
      }

      if (completeImmediately) {
        subject.complete();
      }

      return () => {
        subscription.unsubscribe();
        this.unregisterSubscriber(executionId, subject);
      };
    });
  }

  publish(
    executionId: string,
    event: ExecutionStreamEventDto,
    terminal = false,
  ): void {
    const activeQueue = this.writeQueues.get(executionId) ?? Promise.resolve();
    const nextQueue = activeQueue
      .then(async () => {
        const persistedEvent = await this.executionEventStoreService.append(
          executionId,
          event,
        );
        const messageEvent = this.toMessageEvent(persistedEvent);
        const channel = this.channels.get(executionId);
        if (!channel || channel.size === 0) {
          return;
        }

        for (const subject of channel) {
          subject.next(messageEvent);
          if (terminal) {
            subject.complete();
          }
        }

        if (terminal) {
          this.channels.delete(executionId);
        }
      })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          /foreign key constraint/i.test(error.message)
        ) {
          return;
        }

        this.logger.error(
          `Failed to publish execution stream event for ${executionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => {
        if (terminal) {
          this.writeQueues.delete(executionId);
        }
      });

    this.writeQueues.set(executionId, nextQueue);
  }

  private toMessageEvent(event: ExecutionStreamEventDto): MessageEvent {
    return {
      type: event.type,
      data: event.payload,
    };
  }

  private registerSubscriber(
    executionId: string,
    subject: Subject<MessageEvent>,
  ): void {
    const channel =
      this.channels.get(executionId) ?? new Set<Subject<MessageEvent>>();
    channel.add(subject);
    this.channels.set(executionId, channel);
  }

  private unregisterSubscriber(
    executionId: string,
    subject: Subject<MessageEvent>,
  ): void {
    const channel = this.channels.get(executionId);
    if (!channel) {
      return;
    }

    channel.delete(subject);
    if (channel.size === 0) {
      this.channels.delete(executionId);
    }
  }
}
