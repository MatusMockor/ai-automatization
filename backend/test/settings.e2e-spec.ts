import { faker } from '@faker-js/faker';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../src/common/encryption/encryption.service';
import { UserSettings } from '../src/settings/entities/user-settings.entity';
import { UserFactory } from './factories/user.factory';
import { UserSettingsFactory } from './factories/user-settings.factory';
import { createTestApp } from './helpers/test-app.factory';

type LoginSession = {
  accessToken: string;
  userId: string;
};

describe('Settings (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;
  let userSettingsFactory: UserSettingsFactory;
  let encryptionService: EncryptionService;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    dataSource = context.dataSource;
    userFactory = new UserFactory(dataSource);
    encryptionService = app.get(EncryptionService);
    userSettingsFactory = new UserSettingsFactory(
      dataSource,
      encryptionService,
    );
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/settings should return 401 when missing token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/settings should return empty settings for new user', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<{
        githubToken: string | null;
        claudeOauthToken: string | null;
        executionTimeoutMs: number | null;
        preCommitChecksDefault: unknown;
        aiReviewEnabled: boolean;
        syncEnabled: boolean;
        syncIntervalMinutes: number;
        syncProvidersEnabled: { asana: boolean; jira: boolean };
      }>(),
    ).toEqual({
      githubToken: null,
      claudeOauthToken: null,
      executionTimeoutMs: null,
      preCommitChecksDefault: null,
      aiReviewEnabled: true,
      syncEnabled: false,
      syncIntervalMinutes: 15,
      syncProvidersEnabled: { asana: true, jira: true },
    });
  });

  it('GET /api/settings should return masked tokens for saved settings', async () => {
    const session = await createLoginSession();
    const savedSettings = await userSettingsFactory.create(session.userId);

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      githubToken: string | null;
      claudeOauthToken: string | null;
      executionTimeoutMs: number | null;
      preCommitChecksDefault: unknown;
      aiReviewEnabled: boolean;
      syncEnabled: boolean;
      syncIntervalMinutes: number;
      syncProvidersEnabled: { asana: boolean; jira: boolean };
    }>();

    expect(body.githubToken).toBe(maskToken(savedSettings.githubToken));
    expect(body.claudeOauthToken).toBe(
      maskToken(savedSettings.claudeOauthToken),
    );
    expect(body.executionTimeoutMs).toBe(savedSettings.executionTimeoutMs);
    expect(body.preCommitChecksDefault).toEqual(
      savedSettings.preCommitChecksDefault,
    );
    expect(body.aiReviewEnabled).toBe(savedSettings.aiReviewEnabled);
    expect(body.syncEnabled).toBe(savedSettings.syncEnabled);
    expect(body.syncIntervalMinutes).toBe(15);
    expect(body.syncProvidersEnabled).toEqual(
      savedSettings.syncProvidersEnabled,
    );
  });

  it('PATCH /api/settings should encrypt and persist tokens', async () => {
    const session = await createLoginSession();
    const payload = userSettingsFactory.buildCreateInput({
      githubToken: `ghp_${faker.string.alphanumeric(36)}`,
      claudeOauthToken: `oauth_${faker.string.alphanumeric(48)}`,
      executionTimeoutMs: 1800000,
    });

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload,
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(
      patchResponse.json<{
        githubToken: string | null;
        claudeOauthToken: string | null;
        executionTimeoutMs: number | null;
        preCommitChecksDefault: unknown;
        aiReviewEnabled: boolean;
        syncEnabled: boolean;
        syncIntervalMinutes: number;
        syncProvidersEnabled: { asana: boolean; jira: boolean };
      }>(),
    ).toEqual({
      githubToken: maskToken(payload.githubToken),
      claudeOauthToken: maskToken(payload.claudeOauthToken),
      executionTimeoutMs: payload.executionTimeoutMs,
      preCommitChecksDefault: null,
      aiReviewEnabled: true,
      syncEnabled: false,
      syncIntervalMinutes: 15,
      syncProvidersEnabled: { asana: true, jira: true },
    });

    const storedSettings = await dataSource
      .getRepository(UserSettings)
      .findOneBy({
        userId: session.userId,
      });

    expect(storedSettings).not.toBeNull();
    expect(storedSettings?.githubTokenEncrypted).not.toBe(payload.githubToken);
    expect(storedSettings?.claudeOauthTokenEncrypted).not.toBe(
      payload.claudeOauthToken,
    );
    expect(
      encryptionService.decrypt(storedSettings?.githubTokenEncrypted ?? ''),
    ).toBe(payload.githubToken);
    expect(
      encryptionService.decrypt(
        storedSettings?.claudeOauthTokenEncrypted ?? '',
      ),
    ).toBe(payload.claudeOauthToken);
  });

  it('PATCH /api/settings should support partial update and token removal', async () => {
    const session = await createLoginSession();
    const initialPayload = userSettingsFactory.buildCreateInput();

    const initialResponse = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: initialPayload,
    });

    expect(initialResponse.statusCode).toBe(200);

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        githubToken: null,
        executionTimeoutMs: 600000,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(
      updateResponse.json<{
        githubToken: string | null;
        claudeOauthToken: string | null;
        executionTimeoutMs: number | null;
        preCommitChecksDefault: unknown;
        aiReviewEnabled: boolean;
        syncEnabled: boolean;
        syncIntervalMinutes: number;
        syncProvidersEnabled: { asana: boolean; jira: boolean };
      }>(),
    ).toEqual({
      githubToken: null,
      claudeOauthToken: maskToken(initialPayload.claudeOauthToken),
      executionTimeoutMs: 600000,
      preCommitChecksDefault: null,
      aiReviewEnabled: true,
      syncEnabled: false,
      syncIntervalMinutes: 15,
      syncProvidersEnabled: { asana: true, jira: true },
    });

    const storedSettings = await dataSource
      .getRepository(UserSettings)
      .findOneBy({
        userId: session.userId,
      });

    expect(storedSettings?.githubTokenEncrypted).toBeNull();
    expect(storedSettings?.claudeOauthTokenEncrypted).toEqual(
      expect.any(String),
    );
    expect(storedSettings?.executionTimeoutMs).toBe(600000);
  });

  it('PATCH /api/settings should persist pre-commit checks default profile', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        preCommitChecksDefault: {
          enabled: true,
          mode: 'warn',
          runner: {
            type: 'compose_service',
            service: 'php',
          },
          steps: [
            { preset: 'format', enabled: true },
            { preset: 'lint', enabled: false },
            { preset: 'test', enabled: true },
          ],
          runtime: {
            language: 'php',
            version: '8.2',
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<{ preCommitChecksDefault: unknown }>()
        .preCommitChecksDefault,
    ).toEqual({
      enabled: true,
      mode: 'warn',
      runner: {
        type: 'compose_service',
        service: 'php',
      },
      steps: [
        { preset: 'format', enabled: true },
        { preset: 'lint', enabled: false },
        { preset: 'test', enabled: true },
      ],
      runtime: {
        language: 'php',
        version: '8.2',
      },
    });
  });

  it('PATCH /api/settings should persist scheduled sync settings', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        syncEnabled: true,
        syncIntervalMinutes: 30,
        syncProvidersEnabled: {
          asana: true,
          jira: false,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<{
        githubToken: string | null;
        claudeOauthToken: string | null;
        executionTimeoutMs: number | null;
        preCommitChecksDefault: unknown;
        aiReviewEnabled: boolean;
        syncEnabled: boolean;
        syncIntervalMinutes: number;
        syncProvidersEnabled: { asana: boolean; jira: boolean };
      }>(),
    ).toEqual(
      expect.objectContaining({
        syncEnabled: true,
        syncIntervalMinutes: 30,
        syncProvidersEnabled: {
          asana: true,
          jira: false,
        },
      }),
    );

    const storedSettings = await dataSource
      .getRepository(UserSettings)
      .findOneBy({ userId: session.userId });

    expect(storedSettings?.syncEnabled).toBe(true);
    expect(storedSettings?.syncIntervalMinutes).toBe(30);
    expect(storedSettings?.syncAsanaEnabled).toBe(true);
    expect(storedSettings?.syncJiraEnabled).toBe(false);
  });

  it('PATCH /api/settings should reject enabling automatic sync with all providers disabled', async () => {
    const session = await createLoginSession();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        syncEnabled: true,
        syncProvidersEnabled: {
          asana: false,
          jira: false,
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain(
      'At least one sync provider must be enabled',
    );
  });

  it('PATCH /api/settings should validate executionTimeoutMs bounds and support null reset', async () => {
    const session = await createLoginSession();

    const invalidResponse = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        executionTimeoutMs: 50000,
      },
    });

    expect(invalidResponse.statusCode).toBe(400);

    const validResponse = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        executionTimeoutMs: 120000,
      },
    });
    expect(validResponse.statusCode).toBe(200);
    expect(
      validResponse.json<{ executionTimeoutMs: number | null }>()
        .executionTimeoutMs,
    ).toBe(120000);

    const resetResponse = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        executionTimeoutMs: null,
      },
    });
    expect(resetResponse.statusCode).toBe(200);
    expect(
      resetResponse.json<{ executionTimeoutMs: number | null }>()
        .executionTimeoutMs,
    ).toBeNull();
  });

  const createLoginSession = async (): Promise<LoginSession> => {
    const { user, plainPassword } = await userFactory.create();

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: user.email,
        password: plainPassword,
      },
    });

    expect(loginResponse.statusCode).toBe(200);

    const loginBody = loginResponse.json<{ accessToken: string }>();
    return {
      accessToken: loginBody.accessToken,
      userId: user.id,
    };
  };
});

const maskToken = (token: string | null): string | null => {
  if (!token) {
    return null;
  }

  if (token.length <= 4) {
    return '*'.repeat(token.length);
  }

  return `****${token.slice(-4)}`;
};
