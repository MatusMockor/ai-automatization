import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './helpers/test-app.factory';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/health (GET)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>()).toEqual({ status: 'ok' });
  });
});
