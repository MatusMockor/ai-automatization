import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

type ProviderOverride = {
  token: string | symbol | Function;
  value: unknown;
};

type CreateTestAppOptions = {
  providerOverrides?: ProviderOverride[];
  env?: Record<string, string>;
};

type TestAppContext = {
  app: NestFastifyApplication;
  dataSource: DataSource;
};

const DEFAULT_TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DB_TYPE: 'sqljs',
  DB_SQLJS_LOCATION: '/tmp/ai-automation-test.db',
  DB_SYNCHRONIZE: 'true',
  DB_MIGRATIONS_RUN: 'false',
  JWT_SECRET: 'test-secret',
  JWT_EXPIRATION: '1h',
  BCRYPT_SALT_ROUNDS: '4',
  ENCRYPTION_KEY:
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  REPOSITORIES_BASE_PATH: '/tmp/ai-automation-repositories-test',
  GIT_COMMAND_TIMEOUT_MS: '120000',
  TASK_MANAGER_HTTP_TIMEOUT_MS: '15000',
  TASK_MANAGER_DEFAULT_TASK_LIMIT: '100',
  TASK_MANAGER_MAX_TASK_LIMIT: '100',
  TASKS_DEFAULT_LIMIT: '100',
  TASKS_MAX_LIMIT: '200',
};

export const createTestApp = async (
  options: CreateTestAppOptions = {},
): Promise<TestAppContext> => {
  for (const [key, value] of Object.entries(DEFAULT_TEST_ENV)) {
    process.env[key] = value;
  }

  for (const [key, value] of Object.entries(options.env ?? {})) {
    process.env[key] = value;
  }

  let testingModuleBuilder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  for (const override of options.providerOverrides ?? []) {
    testingModuleBuilder = testingModuleBuilder
      .overrideProvider(override.token)
      .useValue(override.value);
  }

  const moduleFixture: TestingModule = await testingModuleBuilder.compile();

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
