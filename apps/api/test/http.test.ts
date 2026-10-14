import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHttpApp } from '../src/http-app.js';
import { StatusCodes } from 'http-status-codes';

describe('http app', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createHttpApp({ envFilePath: ['.env.example'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health reports ok and returns a request id', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(StatusCodes.OK);
    expect(res.body).toEqual({ status: 'ok', service: 'api' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed incoming request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .set('x-request-id', 'req-abc_123')
      .expect(StatusCodes.OK);
    expect(res.headers['x-request-id']).toBe('req-abc_123');
  });

  it('replaces a malformed incoming request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .set('x-request-id', 'bad id\twith spaces')
      .expect(StatusCodes.OK);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes with the JSON error format', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nope').expect(StatusCodes.NOT_FOUND);
    expect(res.body).toEqual({
      error: { code: 'not_found', message: 'The requested resource was not found.' },
    });
  });

  it('serves the OpenAPI document under /docs', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(StatusCodes.OK);
    expect(res.body.paths['/v1/health'].get.operationId).toBe('getHealth');
  });
});

describe('http app OpenAPI UI switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function docsStatus(env: Record<string, string>): Promise<number> {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const app = await createHttpApp({ envFilePath: ['.env.example'] });
    try {
      await app.init();
      return (await request(app.getHttpServer()).get('/docs-json')).status;
    } finally {
      await app.close();
    }
  }

  it('hides /docs-json in production unless OPENAPI_UI_ENABLED=true', async () => {
    expect(await docsStatus({ NODE_ENV: 'production' })).toBe(StatusCodes.NOT_FOUND);
    expect(await docsStatus({ NODE_ENV: 'production', OPENAPI_UI_ENABLED: 'true' })).toBe(
      StatusCodes.OK,
    );
    expect(await docsStatus({ OPENAPI_UI_ENABLED: 'false' })).toBe(StatusCodes.NOT_FOUND);
  });
});
