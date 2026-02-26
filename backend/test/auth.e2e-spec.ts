import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { UserFactory } from './factories/user.factory';
import { createTestApp } from './helpers/test-app.factory';

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let userFactory: UserFactory;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    dataSource = context.dataSource;
    userFactory = new UserFactory(dataSource);
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/auth/register should create user and return token', async () => {
    const payload = {
      name: 'New User',
      email: 'new-user@example.com',
      password: 'Password123!',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload,
    });

    expect(response.statusCode).toBe(201);

    const body = response.json<{
      accessToken: string;
      user: { id: string; email: string; name: string };
    }>();

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user.email).toBe(payload.email);
    expect(body.user.name).toBe(payload.name);
    expect(body.user.id).toEqual(expect.any(String));

    const storedUser = await dataSource
      .getRepository(User)
      .findOne({ where: { email: payload.email } });

    expect(storedUser).not.toBeNull();
    expect(storedUser?.passwordHash).not.toBe(payload.password);
  });

  it('POST /api/auth/register should reject duplicate email', async () => {
    const email = 'duplicate@example.com';
    await userFactory.create({ email });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Duplicate User',
        email,
        password: 'Password123!',
      },
    });

    expect(response.statusCode).toBe(409);
  });

  it('POST /api/auth/register should return 400 for missing email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        password: 'Password123!',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /api/auth/login should return token for valid credentials', async () => {
    const { user, plainPassword } = await userFactory.create();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: user.email,
        password: plainPassword,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      accessToken: string;
      user: { id: string; email: string; name: string };
    }>();

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });

  it('POST /api/auth/login should reject invalid credentials', async () => {
    const { user } = await userFactory.create();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: user.email,
        password: 'WrongPassword123!',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /api/auth/login should return 400 for malformed email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 12345,
        password: 'Password123!',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /api/auth/me should return 401 when missing token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/auth/me should return authenticated user profile', async () => {
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
    const accessToken = loginBody.accessToken;

    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(meResponse.statusCode).toBe(200);

    expect(
      meResponse.json<{ id: string; email: string; name: string }>(),
    ).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });
});
