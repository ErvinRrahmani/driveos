import { randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { SchoolHasFeatureQuery } from '../../src/modules/platform/index.js';
import { plans, subscriptions } from '../../src/modules/platform/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';

describe('plan features', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let platformAdmin: Record<string, string>;

  const planBody = {
    code: 'base',
    name: 'Plan',
    baseAmountMinor: 4900,
    studentFeeMinor: 300,
    currency: 'EUR',
    maxInstructorSeats: null,
  };

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());

    const adminId = randomUUID();
    const system = await connect(db.systemUrl);
    try {
      await system.query(
        `insert into users (id, full_name, email, locale) values ($1, 'Petra Platform', $2, 'en')`,
        [adminId, `petra.${adminId}@example.com`],
      );
      await system.query(`insert into platform_admins (user_id) values ($1)`, [adminId]);
    } finally {
      await system.end();
    }
    platformAdmin = authHeadersFor(null, { userId: adminId, roles: ['platform_admin'] });

    const planId = newId();
    await tenants.asSystem((tx) =>
      tx.insert(plans).values({
        id: planId,
        code: 'with-page',
        name: 'With page',
        baseAmountMinor: 4900,
        studentFeeMinor: 300,
        currency: 'EUR',
        active: true,
        features: ['enrolment_page'],
      }),
    );
    await tenants.asSchool(A, (tx) =>
      tx.insert(subscriptions).values({
        id: newId(),
        schoolId: A.schoolId,
        planId,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        endedAt: null,
      }),
    );
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  it('SchoolHasFeatureQuery is true only when the active plan lists the feature', async () => {
    expect(await executeAs(kernel.app, A, new SchoolHasFeatureQuery('enrolment_page'))).toBe(true);
    expect(await executeAs(kernel.app, B, new SchoolHasFeatureQuery('enrolment_page'))).toBe(false);
  });

  it('GET /v1/me carries the active plan features', async () => {
    const res = await http.get('/v1/me').set(authHeaders(A));
    expect(res.status).toBe(StatusCodes.OK);
    expect(res.body.active.features).toEqual(['enrolment_page']);
    const other = await http.get('/v1/me').set(authHeaders(B));
    expect(other.body.active.features).toEqual([]);
  });

  it('POST /v1/platform/plans accepts features and rejects unknown ones', async () => {
    const ok = await http
      .post('/v1/platform/plans')
      .set(platformAdmin)
      .send({ ...planBody, code: 'pro', features: ['enrolment_page'] });
    expect(ok.status).toBe(StatusCodes.CREATED);
    const bad = await http
      .post('/v1/platform/plans')
      .set(platformAdmin)
      .send({ ...planBody, code: 'x', features: ['teleport'] });
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it('lists and patches plan features', async () => {
    const created = await http
      .post('/v1/platform/plans')
      .set(platformAdmin)
      .send({ ...planBody, code: 'plain' });
    expect(created.status).toBe(StatusCodes.CREATED);
    const patched = await http
      .patch(`/v1/platform/plans/${created.body.id}`)
      .set(platformAdmin)
      .send({ features: ['enrolment_page'] });
    expect(patched.status).toBe(StatusCodes.OK);
    const list = await http.get('/v1/platform/plans?limit=100').set(platformAdmin);
    const plain = (list.body.items as { code: string; features: string[] }[]).find(
      (plan) => plan.code === 'plain',
    );
    expect(plain?.features).toEqual(['enrolment_page']);
  });
});
