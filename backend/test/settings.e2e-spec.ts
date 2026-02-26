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
        claudeApiKey: string | null;
      }>(),
    ).toEqual({
      githubToken: null,
      claudeApiKey: null,
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
      claudeApiKey: string | null;
    }>();

    expect(body.githubToken).toBe(maskToken(savedSettings.githubToken));
    expect(body.claudeApiKey).toBe(maskToken(savedSettings.claudeApiKey));
  });

  it('PATCH /api/settings should encrypt and persist tokens', async () => {
    const session = await createLoginSession();
    const payload = userSettingsFactory.buildCreateInput({
      githubToken: `ghp_${faker.string.alphanumeric(36)}`,
      claudeApiKey: `sk-ant-${faker.string.alphanumeric(40)}`,
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
        claudeApiKey: string | null;
      }>(),
    ).toEqual({
      githubToken: maskToken(payload.githubToken),
      claudeApiKey: maskToken(payload.claudeApiKey),
    });

    const storedSettings = await dataSource
      .getRepository(UserSettings)
      .findOneBy({
        userId: session.userId,
      });

    expect(storedSettings).not.toBeNull();
    expect(storedSettings?.githubTokenEncrypted).not.toBe(payload.githubToken);
    expect(storedSettings?.claudeApiKeyEncrypted).not.toBe(
      payload.claudeApiKey,
    );
    expect(
      encryptionService.decrypt(storedSettings?.githubTokenEncrypted ?? ''),
    ).toBe(payload.githubToken);
    expect(
      encryptionService.decrypt(storedSettings?.claudeApiKeyEncrypted ?? ''),
    ).toBe(payload.claudeApiKey);
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
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(
      updateResponse.json<{
        githubToken: string | null;
        claudeApiKey: string | null;
      }>(),
    ).toEqual({
      githubToken: null,
      claudeApiKey: maskToken(initialPayload.claudeApiKey),
    });

    const storedSettings = await dataSource
      .getRepository(UserSettings)
      .findOneBy({
        userId: session.userId,
      });

    expect(storedSettings?.githubTokenEncrypted).toBeNull();
    expect(storedSettings?.claudeApiKeyEncrypted).toEqual(expect.any(String));
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
