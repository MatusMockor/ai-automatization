import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const logger = new Logger('WorkerBootstrap');

async function bootstrapWorker(): Promise<void> {
  process.env.EXECUTION_WORKER_ENABLED = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  let shuttingDown = false;
  const shutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.log(`Shutting down worker context (${signal})`);
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      logger.error(
        'Worker shutdown failed',
        error instanceof Error ? error.stack : String(error),
      );
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  logger.log('Execution worker started');
}

void bootstrapWorker().catch((error: unknown) => {
  logger.error(
    'Execution worker bootstrap failed',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
