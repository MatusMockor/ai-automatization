import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { ExecutionStreamEventDto } from './dto/execution-stream-event.dto';

@Injectable()
export class ExecutionStreamHub {
  private readonly channels = new Map<string, Set<Subject<MessageEvent>>>();

  createStream(
    executionId: string,
    snapshotEvent: ExecutionStreamEventDto,
    completeImmediately: boolean,
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
    const channel = this.channels.get(executionId);
    if (!channel || channel.size === 0) {
      return;
    }

    const messageEvent = this.toMessageEvent(event);
    for (const subject of channel) {
      subject.next(messageEvent);
      if (terminal) {
        subject.complete();
      }
    }

    if (terminal) {
      this.channels.delete(executionId);
    }
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
