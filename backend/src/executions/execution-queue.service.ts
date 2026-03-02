import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { parsePositiveInteger } from '../common/utils/parse.utils';

type QueueJobPayload = {
  executionId: string;
  queuedAt: string;
  attempts: number;
};

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class ExecutionQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionQueueService.name);
  private readonly driver: 'redis' | 'inline';
  private readonly queueName: string;
  private readonly deadLetterQueueName: string;
  private readonly redisUrl: string;
  private readonly maxAttempts: number;
  private readonly consumeErrorBackoffMs: number;
  private producerClient: RedisClient | null = null;
  private consumerClient: RedisClient | null = null;
  private producerClientPromise: Promise<RedisClient> | null = null;
  private consumerClientPromise: Promise<RedisClient> | null = null;

  constructor(private readonly configService: ConfigService) {
    const configuredDriver = (
      this.configService.get<string>('EXECUTION_QUEUE_DRIVER', 'redis') ??
      'redis'
    )
      .trim()
      .toLowerCase();

    this.driver = configuredDriver === 'inline' ? 'inline' : 'redis';
    this.queueName =
      this.configService.get<string>('EXECUTION_QUEUE_NAME', 'executions') ??
      'executions';
    this.deadLetterQueueName = `${this.queueName}:dead`;
    this.redisUrl =
      this.configService.get<string>('REDIS_URL', 'redis://redis:6379') ??
      'redis://redis:6379';
    this.maxAttempts = parsePositiveInteger(
      this.configService.get<string>('EXECUTION_QUEUE_MAX_ATTEMPTS', '3'),
      3,
    );
    this.consumeErrorBackoffMs = parsePositiveInteger(
      this.configService.get<string>(
        'EXECUTION_QUEUE_CONSUME_ERROR_BACKOFF_MS',
        '250',
      ),
      250,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.isRedisDriver()) {
      return;
    }

    await this.ensureProducerClient();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producerClient) {
      await this.producerClient.quit().catch(() => undefined);
      this.producerClient = null;
    }
    this.producerClientPromise = null;

    if (this.consumerClient) {
      await this.consumerClient.quit().catch(() => undefined);
      this.consumerClient = null;
    }
    this.consumerClientPromise = null;
  }

  isInlineDriver(): boolean {
    return this.driver === 'inline';
  }

  async enqueue(executionId: string): Promise<void> {
    if (!this.isRedisDriver()) {
      return;
    }

    const client = await this.ensureProducerClient();
    const payload: QueueJobPayload = {
      executionId,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };
    await client.rPush(this.queueName, JSON.stringify(payload));
  }

  async consume(
    onExecution: (executionId: string) => Promise<void>,
    shouldStop: () => boolean,
  ): Promise<void> {
    if (!this.isRedisDriver()) {
      return;
    }

    const client = await this.ensureConsumerClient();
    while (!shouldStop()) {
      try {
        const item = await client.blPop(this.queueName, 1);
        if (!item) {
          continue;
        }

        const payload = this.parsePayload(item.element);
        if (!payload) {
          continue;
        }

        try {
          await onExecution(payload.executionId);
        } catch (error) {
          await this.handleJobFailure(client, payload, error);
        }
      } catch (error) {
        this.logger.error(
          'Execution queue consume iteration failed',
          error instanceof Error ? error.stack : String(error),
        );
        await this.delay(this.consumeErrorBackoffMs);
      }
    }
  }

  private parsePayload(value: string): QueueJobPayload | null {
    try {
      const parsed = JSON.parse(value) as Partial<QueueJobPayload>;
      if (!parsed.executionId || typeof parsed.executionId !== 'string') {
        return null;
      }

      return {
        executionId: parsed.executionId,
        queuedAt:
          typeof parsed.queuedAt === 'string'
            ? parsed.queuedAt
            : new Date().toISOString(),
        attempts:
          typeof parsed.attempts === 'number' &&
          Number.isFinite(parsed.attempts) &&
          parsed.attempts >= 0
            ? Math.trunc(parsed.attempts)
            : 0,
      };
    } catch {
      return null;
    }
  }

  private async handleJobFailure(
    client: RedisClient,
    payload: QueueJobPayload,
    error: unknown,
  ): Promise<void> {
    const nextAttempts = payload.attempts + 1;
    this.logger.error(
      `Execution queue job failed for ${payload.executionId} (attempt ${nextAttempts}/${this.maxAttempts})`,
      error instanceof Error ? error.stack : String(error),
    );

    if (nextAttempts < this.maxAttempts) {
      await client.rPush(
        this.queueName,
        JSON.stringify({
          ...payload,
          attempts: nextAttempts,
        } satisfies QueueJobPayload),
      );
      return;
    }

    await client.rPush(
      this.deadLetterQueueName,
      JSON.stringify({
        ...payload,
        attempts: nextAttempts,
      } satisfies QueueJobPayload),
    );
  }

  private isRedisDriver(): boolean {
    return this.driver === 'redis';
  }

  private async ensureProducerClient(): Promise<RedisClient> {
    if (this.producerClient) {
      return this.producerClient;
    }
    if (this.producerClientPromise) {
      return this.producerClientPromise;
    }

    this.producerClientPromise = (async () => {
      const client = createClient({
        url: this.redisUrl,
      });

      client.on('error', (error: unknown) => {
        this.logger.error(
          'Redis producer client error',
          error instanceof Error ? error.stack : String(error),
        );
      });

      await client.connect();
      this.producerClient = client;
      return client;
    })();

    try {
      return await this.producerClientPromise;
    } finally {
      this.producerClientPromise = null;
    }
  }

  private async ensureConsumerClient(): Promise<RedisClient> {
    if (this.consumerClient) {
      return this.consumerClient;
    }
    if (this.consumerClientPromise) {
      return this.consumerClientPromise;
    }

    this.consumerClientPromise = (async () => {
      const client = createClient({
        url: this.redisUrl,
      });

      client.on('error', (error: unknown) => {
        this.logger.error(
          'Redis consumer client error',
          error instanceof Error ? error.stack : String(error),
        );
      });

      await client.connect();
      this.consumerClient = client;
      return client;
    })();

    try {
      return await this.consumerClientPromise;
    } finally {
      this.consumerClientPromise = null;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
