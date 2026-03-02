import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const logger = new Logger('WorkerBootstrap');

async function bootstrapWorker(): Promise<void> {
  process.env.EXECUTION_WORKER_ENABLED = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const shutdown = async (): Promise<void> => {
    logger.log('Shutting down worker context');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });

  logger.log('Execution worker started');
}

void bootstrapWorker();
