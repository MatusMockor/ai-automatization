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
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.log('Shutting down worker context');
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
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
