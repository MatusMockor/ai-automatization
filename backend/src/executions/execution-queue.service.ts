import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

type QueueJobPayload = {
  executionId: string;
  queuedAt: string;
};

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class ExecutionQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionQueueService.name);
  private readonly driver: 'redis' | 'inline';
  private readonly queueName: string;
  private readonly redisUrl: string;
  private producerClient: RedisClient | null = null;
  private consumerClient: RedisClient | null = null;

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
    this.redisUrl =
      this.configService.get<string>('REDIS_URL', 'redis://redis:6379') ??
      'redis://redis:6379';
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

    if (this.consumerClient) {
      await this.consumerClient.quit().catch(() => undefined);
      this.consumerClient = null;
    }
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
        const item = await client.brPop(this.queueName, 1);
        if (!item) {
          continue;
        }

        const payload = this.parsePayload(item.element);
        if (!payload) {
          continue;
        }

        await onExecution(payload.executionId);
      } catch (error) {
        this.logger.error(
          'Execution queue consume iteration failed',
          error instanceof Error ? error.stack : String(error),
        );
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
      };
    } catch {
      return null;
    }
  }

  private isRedisDriver(): boolean {
    return this.driver === 'redis';
  }

  private async ensureProducerClient(): Promise<RedisClient> {
    if (this.producerClient) {
      return this.producerClient;
    }

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
  }

  private async ensureConsumerClient(): Promise<RedisClient> {
    if (this.consumerClient) {
      return this.consumerClient;
    }

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
  }
}
