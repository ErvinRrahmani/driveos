import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { type INestApplication, Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, type MockInstance, vi } from 'vitest';
import { createHttpApp } from '../../src/http-app.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { listRoutes } from '../support/cross-tenant.js';
import { createKernelTestApp, devAuth, type KernelTestApp } from '../support/kernel-app.js';

const LIMITS = {
  RATE_LIMIT_ENABLED: 'true',
  RATE_LIMIT_HEALTH_LIMIT: '3',
  RATE_LIMIT_HEALTH_WINDOW_SECONDS: '1',
  RATE_LIMIT_AUTH_LIMIT: '4',
  RATE_LIMIT_AUTH_WINDOW_SECONDS: '60',
  RATE_LIMIT_AUTH_CONTACT_LIMIT: '2',
  RATE_LIMIT_AUTH_CONTACT_WINDOW_SECONDS: '60',
  RATE_LIMIT_LEADS_LIMIT: '2',
  RATE_LIMIT_LEADS_WINDOW_SECONDS: '60',
};

describe('rate limits on public routes (Redis)', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let ipCounter = 0;

  const freshIp = () => `203.0.113.${++ipCounter}`;
  const http = () => request(kernel.app.getHttpServer());
  const health = (ip: string) => http().get('/v1/health').set('X-Forwarded-For', ip);
  const verify = (ip: string, contact: string) =>
    http()
      .post('/v1/auth/verify')
      .set('X-Forwarded-For', ip)
      .send({ contact, code: '000000', client: 'web' });

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db, [], { env: LIMITS });
  });

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  it('answers the N+1th request in the window with 429 rate_limited and Retry-After', async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i += 1) expect((await health(ip)).status).toBe(StatusCodes.OK);

    const res = await health(ip);

    expect(res.status).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(res.body).toEqual({
      error: {
        code: 'rate_limited',
        message: expect.any(String),
        details: { retryAfterSeconds: Number(res.headers['retry-after']) },
      },
    });
  });

  it('lets requests through again once the window has passed', async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i += 1) await health(ip);
    expect((await health(ip)).status).toBe(StatusCodes.TOO_MANY_REQUESTS);

    await sleep(1_100);

    expect((await health(ip)).status).toBe(StatusCodes.OK);
  });

  it('counts per client IP', async () => {
    const first = freshIp();
    for (let i = 0; i < 4; i += 1) await health(first);
    expect((await health(first)).status).toBe(StatusCodes.TOO_MANY_REQUESTS);

    expect((await health(freshIp())).status).toBe(StatusCodes.OK);
  });

  it('counts ip+route limits per route', async () => {
    const ip = freshIp();
    const refresh = () =>
      http().post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: 'nope' });
    for (let i = 0; i < 4; i += 1) {
      expect((await refresh()).status).not.toBe(StatusCodes.TOO_MANY_REQUESTS);
    }
    expect((await refresh()).status).toBe(StatusCodes.TOO_MANY_REQUESTS);

    const logout = await http()
      .post('/v1/auth/logout')
      .set('X-Forwarded-For', ip)
      .send({ refreshToken: 'nope' });
    expect(logout.status).not.toBe(StatusCodes.TOO_MANY_REQUESTS);
  });

  it('counts contact limits per contact, whichever IP the request comes from', async () => {
    const contact = `${randomUUID()}@example.com`;
    for (let i = 0; i < 2; i += 1) {
      expect((await verify(freshIp(), contact)).status).not.toBe(StatusCodes.TOO_MANY_REQUESTS);
    }

    const blocked = await verify(freshIp(), contact.toUpperCase());
    expect(blocked.status).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect(blocked.headers['retry-after']).toBeDefined();

    const other = await verify(freshIp(), `${randomUUID()}@example.com`);
    expect(other.status).not.toBe(StatusCodes.TOO_MANY_REQUESTS);
  });

  it('limits public lead capture per IP and route', async () => {
    const ip = freshIp();
    const capture = (from: string) =>
      http()
        .post('/v1/public/schools/no-such-school/leads')
        .set('X-Forwarded-For', from)
        .send({ fullName: 'Rate Limited', email: 'rate@example.com', licenceClass: 'B' });
    for (let i = 0; i < 2; i += 1) {
      expect((await capture(ip)).status).not.toBe(StatusCodes.TOO_MANY_REQUESTS);
    }

    expect((await capture(ip)).status).toBe(StatusCodes.TOO_MANY_REQUESTS);
    expect((await capture(freshIp())).status).not.toBe(StatusCodes.TOO_MANY_REQUESTS);
  });

  it('never limits authenticated tenant routes', async () => {
    const ip = freshIp();
    const headers = devAuth(randomUUID(), randomUUID());
    for (let i = 0; i < 12; i += 1) {
      const res = await http().get('/v1/school').set(headers).set('X-Forwarded-For', ip);
      expect(res.status).not.toBe(StatusCodes.TOO_MANY_REQUESTS);
    }
  });

  it('declares a rate limit on every public route and on no other route', () => {
    const controllerRoutes = listRoutes(kernel.app).filter(
      (route) => route.source === 'controller',
    );
    const publicWithout = controllerRoutes
      .filter((route) => route.isPublic && (route.rateLimits ?? []).length === 0)
      .map((route) => route.key);
    const limitedPrivate = controllerRoutes
      .filter((route) => !route.isPublic && (route.rateLimits ?? []).length > 0)
      .map((route) => route.key);

    expect(publicWithout).toEqual([]);
    expect(limitedPrivate).toEqual([]);
    expect(controllerRoutes.filter((route) => route.isPublic).map((r) => r.key)).toEqual(
      expect.arrayContaining([
        'POST /v1/auth/code',
        'POST /v1/auth/verify',
        'POST /v1/auth/refresh',
        'POST /v1/auth/logout',
        'POST /v1/invitations/:token/accept',
        'POST /v1/webhooks/payments/:provider',
        'POST /v1/public/schools/:slug/leads',
        'GET /v1/health',
      ]),
    );
  });
});

describe('rate limits when Redis is down', () => {
  let app: INestApplication;
  let warn: MockInstance<Logger['warn']>;

  beforeAll(async () => {
    for (const [key, value] of Object.entries({ ...LIMITS, REDIS_URL: 'redis://127.0.0.1:1' })) {
      vi.stubEnv(key, value);
    }
    warn = vi.spyOn(Logger.prototype, 'warn');
    app = await createHttpApp({ envFilePath: ['.env.example'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    warn?.mockRestore();
    vi.unstubAllEnvs();
  });

  it('fails open quickly and warns once', async () => {
    const ip = '198.51.100.7';
    for (let i = 0; i < 5; i += 1) {
      const started = Date.now();
      const res = await request(app.getHttpServer()).get('/v1/health').set('X-Forwarded-For', ip);
      expect(res.status).toBe(StatusCodes.OK);
      expect(Date.now() - started).toBeLessThan(1_000);
    }
    const skipped = warn.mock.calls.filter(
      ([message]) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { msg?: string }).msg === 'rate limit check skipped: redis unavailable',
    );
    expect(skipped).toHaveLength(1);
  }, 15_000);
});
