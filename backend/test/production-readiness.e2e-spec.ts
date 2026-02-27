import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './helpers/test-app.factory';

describe('Production Readiness (e2e)', () => {
  let app: NestFastifyApplication | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  it('should keep Swagger endpoints disabled when ENABLE_SWAGGER=false', async () => {
    const context = await createTestApp({
      env: {
        ENABLE_SWAGGER: 'false',
      },
    });
    app = context.app;

    const docsResponse = await app.inject({
      method: 'GET',
      url: '/api/docs',
    });
    const docsJsonResponse = await app.inject({
      method: 'GET',
      url: '/api/docs-json',
    });

    expect(docsResponse.statusCode).toBe(404);
    expect(docsJsonResponse.statusCode).toBe(404);
  });

  it('should expose Swagger endpoints when ENABLE_SWAGGER=true', async () => {
    const context = await createTestApp({
      env: {
        ENABLE_SWAGGER: 'true',
        SWAGGER_PATH: 'api/internal-docs',
      },
    });
    app = context.app;

    const docsResponse = await app.inject({
      method: 'GET',
      url: '/api/internal-docs',
    });
    const docsJsonResponse = await app.inject({
      method: 'GET',
      url: '/api/internal-docs-json',
    });
    const defaultDocsResponse = await app.inject({
      method: 'GET',
      url: '/api/docs',
    });

    expect([200, 301, 302, 307, 308]).toContain(docsResponse.statusCode);
    expect(docsJsonResponse.statusCode).toBe(200);
    expect(defaultDocsResponse.statusCode).toBe(404);
    expect(docsJsonResponse.json<{ openapi: string }>().openapi).toContain(
      '3.',
    );
  });

  it('should bypass throttling on GET /api/health', async () => {
    const context = await createTestApp({
      env: {
        THROTTLE_LIMIT: '1',
        THROTTLE_TTL_MS: '60000',
      },
    });
    app = context.app;

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/health' }),
      app.inject({ method: 'GET', url: '/api/health' }),
      app.inject({ method: 'GET', url: '/api/health' }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200,
    ]);
  });

  it('should enforce global throttling on public endpoints', async () => {
    const context = await createTestApp({
      env: {
        THROTTLE_LIMIT: '2',
        THROTTLE_TTL_MS: '60000',
      },
    });
    app = context.app;

    const responses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {},
        }),
      );
    }

    const statusCodes = responses.map((response) => response.statusCode);
    expect(statusCodes.some((statusCode) => statusCode === 429)).toBe(true);
  });
});
