import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHttpApp } from '../../src/http-app.js';
import { DatabaseService } from '../../src/kernel/db/database.service.js';
import { StatusCodes } from 'http-status-codes';

describe.each(['production', 'development'])('auth with NODE_ENV=%s', (nodeEnv) => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    app = await createHttpApp({ envFilePath: ['.env.example'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('ignores the dev headers and answers 401 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/me')
      .set({
        'X-Dev-School': '0192f000-0001-7000-8000-000000000001',
        'X-Dev-User': '0192f000-0002-7000-8000-000000000001',
      })
      .expect(StatusCodes.UNAUTHORIZED);
    expect(res.body.error.code).toBe('unauthenticated');
    expect(app.get(DatabaseService).opened).toBe(false);
  });

  it('still serves /v1/health without a database connection', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(StatusCodes.OK);
    expect(app.get(DatabaseService).opened).toBe(false);
  });
});
