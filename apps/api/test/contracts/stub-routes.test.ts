import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import {
  callRoute,
  createCrossTenantApp,
  type CrossTenantApp,
  listRoutes,
  placeholderParams,
} from '../support/cross-tenant.js';
import { expressKey, PUBLIC_STUB_ROUTES, STUB_ROUTES } from '../support/spec-routes.js';
import { authHeadersFor } from '../support/tenants.js';
import { StatusCodes } from 'http-status-codes';

const DENIED: readonly { key: string; roles: string[]; permission: string }[] = [
  { key: 'PATCH /v1/school', roles: ['student'], permission: 'school.manage' },
  { key: 'POST /v1/platform/schools', roles: ['owner'], permission: 'platform.manage' },
  { key: 'POST /v1/sync', roles: ['student'], permission: 'sync.use' },
  { key: 'DELETE /v1/students/:id', roles: ['instructor'], permission: 'students.anonymize' },
  { key: 'POST /v1/theory/sessions', roles: ['instructor'], permission: 'theory.use' },
  { key: 'POST /v1/refunds', roles: ['student'], permission: 'refunds.create' },
  { key: 'POST /v1/contracts', roles: ['parent'], permission: 'contracts.manage' },
  { key: 'POST /v1/conversations/:id/messages', roles: ['parent'], permission: 'chat.use' },
  { key: 'GET /v1/reports/revenue', roles: ['office'], permission: 'reports.read' },
];

describe('501 controller stubs (step 3b)', () => {
  let db: ScratchDatabase;
  let harness: CrossTenantApp;

  beforeAll(async () => {
    db = await createScratchDatabase();
    harness = await createCrossTenantApp(db);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await db?.drop();
  });

  const headersFor = (key: string): Record<string, string> => {
    const { A } = harness.context;
    if (PUBLIC_STUB_ROUTES.includes(key)) return {};
    if (key.includes(' /v1/platform/')) {
      return authHeadersFor(null, { roles: ['platform_admin'], userId: randomUUID() });
    }
    return authHeadersFor(A, { roles: ['owner'], membershipId: A.ownerMembershipId });
  };

  it('registers every stub route in the app', () => {
    const registered = new Set(listRoutes(harness.app).map((route) => route.key));
    expect(STUB_ROUTES.map(expressKey).filter((key) => !registered.has(key))).toEqual([]);
  });

  it.each(STUB_ROUTES.map(expressKey))(
    '%s answers 501 not_implemented to a caller with the permission',
    async (key) => {
      const [, path = ''] = key.split(' ');
      const res = await callRoute(
        harness.context.request,
        key,
        { params: placeholderParams(path), headers: { 'Idempotency-Key': randomUUID() } },
        headersFor(key),
      );

      expect(res.status, `${key} → ${res.status} ${res.text.slice(0, 200)}`).toBe(
        StatusCodes.NOT_IMPLEMENTED,
      );
      expect(res.body).toEqual({
        error: { code: 'not_implemented', message: expect.any(String) },
      });
    },
  );

  it.each(DENIED)(
    '$key answers 403 to $roles before reaching the stub',
    async ({ key, roles, permission }) => {
      const { A } = harness.context;
      const [, path = ''] = key.split(' ');
      const res = await callRoute(
        harness.context.request,
        key,
        { params: placeholderParams(path), headers: { 'Idempotency-Key': randomUUID() } },
        authHeadersFor(A, { roles, userId: randomUUID(), membershipId: randomUUID() }),
      );

      expect(res.status).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.error.code).toBe('forbidden');
      expect(JSON.stringify(res.body.error.details)).toContain(permission);
    },
  );

  it('rejects an unauthenticated call to a stub with 401', async () => {
    const res = await request(harness.app.getHttpServer()).get('/v1/school');
    expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});
