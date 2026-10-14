import { randomUUID } from 'node:crypto';
import { platformStatementListResponseSchema } from '@driveos/shared';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { MonthlyStatementsJob } from '../../src/modules/billing/infra/monthly-statements.job.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { createStaffLogin } from './support.js';
import { insertPlan, pendingCharge, subscribe } from './platform-billing-support.js';
import { StatusCodes } from 'http-status-codes';

describe('platform statements over HTTP', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let admin: Record<string, string>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    worker = await createWorkerTestHarness(db);

    const adminId = randomUUID();
    await system.query(
      `insert into users (id, full_name, email, locale) values ($1, 'Petra Platform', $2, 'en')`,
      [adminId, `petra.${adminId}@example.com`],
    );
    await system.query(`insert into platform_admins (user_id) values ($1)`, [adminId]);
    admin = authHeadersFor(null, { userId: adminId, roles: ['platform_admin'] });

    const standard = await insertPlan(system, { baseAmountMinor: 4900, studentFeeMinor: 300 });
    await subscribe(system, A.schoolId, standard, '2026-07-01T00:00:00Z');
    await subscribe(system, B.schoolId, standard, '2026-07-01T00:00:00Z');
    await pendingCharge(system, A.schoolId, {
      kind: 'base_subscription',
      studentId: null,
      periodMonth: '2026-09-01',
      amountMinor: 100,
    });
    const job = worker.app.get(MonthlyStatementsJob);
    await job.issueStatements('2026-08');
    await job.issueStatements('2026-09');
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const statementIdsOf = async (tenant: TestTenant) =>
    (
      await system.query<{ id: string }>(
        `select id from platform_statements where school_id = $1 order by month desc`,
        [tenant.schoolId],
      )
    ).rows.map((row) => row.id);

  it("lists the school's own statements, newest month first", async () => {
    const res = await http
      .get('/v1/platform-statements')
      .set(authHeaders(A))
      .expect(StatusCodes.OK);

    const body = platformStatementListResponseSchema.parse(res.body);
    expect(body.items.map((s) => s.id)).toEqual(await statementIdsOf(A));
    expect(body.items.every((s) => s.schoolId === A.schoolId)).toBe(true);
    expect(body.items[0]).toEqual({
      id: expect.any(String),
      schoolId: A.schoolId,
      schoolName: 'School A',
      month: '2026-09',
      totalMinor: 5000,
      currency: 'EUR',
      status: 'issued',
      issuedAt: expect.any(String),
      paidAt: null,
      paidMethod: null,
      paidReference: null,
      markedPaidByUserId: null,
    });
    expect(body.nextCursor).toBeNull();
  });

  it('never shows another school its statements', async () => {
    const res = await http
      .get('/v1/platform-statements')
      .set(authHeaders(B))
      .expect(StatusCodes.OK);

    const ids = res.body.items.map((s: { id: string }) => s.id);
    expect(ids).toEqual(await statementIdsOf(B));
    for (const id of await statementIdsOf(A)) expect(ids).not.toContain(id);
  });

  it('pages with a cursor and filters by month and status', async () => {
    const first = await http
      .get('/v1/platform-statements?limit=1')
      .set(authHeaders(A))
      .expect(StatusCodes.OK);
    expect(first.body.items.map((s: { month: string }) => s.month)).toEqual(['2026-09']);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await http
      .get(`/v1/platform-statements?limit=1&cursor=${first.body.nextCursor}`)
      .set(authHeaders(A))
      .expect(StatusCodes.OK);
    expect(second.body.items.map((s: { month: string }) => s.month)).toEqual(['2026-08']);
    expect(second.body.nextCursor).toBeNull();

    const august = await http
      .get('/v1/platform-statements?month=2026-08')
      .set(authHeaders(A))
      .expect(StatusCodes.OK);
    expect(august.body.items.map((s: { month: string }) => s.month)).toEqual(['2026-08']);
    const paid = await http
      .get('/v1/platform-statements?status=paid')
      .set(authHeaders(A))
      .expect(StatusCodes.OK);
    expect(paid.body.items).toEqual([]);
  });

  it('rejects an unknown cursor', async () => {
    await http
      .get('/v1/platform-statements?cursor=nope')
      .set(authHeaders(A))
      .expect(StatusCodes.BAD_REQUEST);
  });

  it('is for owners only', async () => {
    const office = await createStaffLogin(tenants, A, ['office']);
    const res = await http.get('/v1/platform-statements').set(office).expect(StatusCodes.FORBIDDEN);
    expect(res.body.error.details).toEqual({ permission: 'platform_statements.read' });
  });

  it('shows job-issued statements to the platform admin, who marks one paid', async () => {
    const [september] = await statementIdsOf(A);
    const all = await http
      .get('/v1/platform/statements?status=issued')
      .set(admin)
      .expect(StatusCodes.OK);
    const ids = all.body.items.map((s: { id: string }) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([...(await statementIdsOf(A)), ...(await statementIdsOf(B))]),
    );

    await http
      .post(`/v1/platform/statements/${september}/mark-paid`)
      .set(admin)
      .send({ method: 'bank_transfer', paidAt: '2026-10-06T10:00:00.000Z', reference: 'SEPA-42' })
      .expect(StatusCodes.OK, { id: september, version: 2 });

    const own = await http
      .get('/v1/platform-statements?status=paid')
      .set(authHeaders(A))
      .expect(StatusCodes.OK);
    expect(own.body.items).toEqual([
      expect.objectContaining({
        id: september,
        status: 'paid',
        paidAt: '2026-10-06T10:00:00.000Z',
        paidMethod: 'bank_transfer',
        paidReference: 'SEPA-42',
        markedPaidByUserId: admin['X-Dev-User'],
      }),
    ]);
  });
});
