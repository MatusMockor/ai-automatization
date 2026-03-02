import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/common/bootstrap/app-bootstrap';

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

const TEST_ENV_SUFFIX = `${process.env.JEST_WORKER_ID ?? '0'}-${process.pid}`;

const DEFAULT_TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DB_TYPE: 'sqljs',
  DB_SQLJS_LOCATION: `/tmp/ai-automation-test-${TEST_ENV_SUFFIX}.db`,
  DB_SYNCHRONIZE: 'true',
  DB_MIGRATIONS_RUN: 'false',
  JWT_SECRET: 'test-secret',
  JWT_EXPIRATION: '1h',
  ALLOWED_ORIGINS: '*',
  BCRYPT_SALT_ROUNDS: '4',
  ENCRYPTION_KEY:
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
  REPOSITORIES_BASE_PATH: `/tmp/ai-automation-repositories-test-${TEST_ENV_SUFFIX}`,
  GIT_COMMAND_TIMEOUT_MS: '120000',
  GITHUB_API_BASE_URL: 'https://api.github.com',
  TASK_MANAGER_HTTP_TIMEOUT_MS: '15000',
  TASK_MANAGER_DEFAULT_TASK_LIMIT: '100',
  TASK_MANAGER_MAX_TASK_LIMIT: '100',
  TASKS_DEFAULT_LIMIT: '100',
  TASKS_MAX_LIMIT: '200',
  EXECUTION_DEFAULT_TIMEOUT_MS: '1800000',
  EXECUTION_MIN_TIMEOUT_MS: '1',
  EXECUTION_MAX_TIMEOUT_MS: '7200000',
  EXECUTION_MAX_CONCURRENT_PER_USER: '2',
  EXECUTION_OUTPUT_MAX_BYTES: '204800',
  EXECUTION_GRACEFUL_STOP_MS: '5000',
  EXECUTION_GIT_AUTHOR_NAME: 'Automation Bot',
  EXECUTION_GIT_AUTHOR_EMAIL: 'automation@local',
  EXECUTION_AUTOPR_RETRY_COUNT: '3',
  EXECUTION_AUTOPR_RETRY_BACKOFF_MS: '2000',
  EXECUTION_PRE_PR_CHECK_COMMAND: '',
  EXECUTION_AUTOPR_BRANCH_PREFIX: 'feature/ai',
  EXECUTION_QUEUE_DRIVER: 'inline',
  EXECUTION_QUEUE_NAME: 'executions',
  REDIS_URL: 'redis://localhost:6379',
  EXECUTION_WORKER_ENABLED: 'false',
  EXECUTION_WORKER_RECOVERY_TIMEOUT_MS: '900000',
  EXECUTION_RETENTION_ENABLED: 'false',
  EXECUTION_RETENTION_TIMEZONE: 'UTC',
  ENABLE_SWAGGER: 'false',
  ENABLE_METRICS: 'true',
  SWAGGER_PATH: 'api/docs',
  THROTTLE_TTL_MS: '60000',
  THROTTLE_LIMIT: '60',
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
  configureApplication(app);

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    dataSource: app.get(DataSource),
  };
};
