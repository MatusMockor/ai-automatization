import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

type TestAppContext = {
  app: NestFastifyApplication;
  dataSource: DataSource;
};

export const createTestApp = async (): Promise<TestAppContext> => {
  process.env.NODE_ENV = 'test';
  process.env.DB_TYPE = 'sqljs';
  process.env.DB_SQLJS_LOCATION = '/tmp/ai-automation-test.db';
  process.env.DB_SYNCHRONIZE = 'true';
  process.env.DB_MIGRATIONS_RUN = 'false';
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRATION = '1h';
  process.env.BCRYPT_SALT_ROUNDS = '4';
  process.env.ENCRYPTION_KEY =
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    dataSource: app.get(DataSource),
  };
};
