import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createLogin, linkGuardianRow, type Login } from '../training/support.js';
import { createPriceItemRow, createStudentLogin, type StudentLogin } from './support.js';
import { StatusCodes } from 'http-status-codes';

describe('billing access for parents (linked students with consent, via training)', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let parent: Login;
  let child: StudentLogin;
  let secondChild: StudentLogin;
  let unconsented: StudentLogin;
  let stranger: StudentLogin;
  let packageId: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    A = tenants.A;
    http = request(kernel.app.getHttpServer());
    await http
      .post('/v1/school/payment-account')
      .set(authHeaders(A))
      .send({ provider: 'fake' })
      .expect(StatusCodes.OK);
    parent = await createLogin(tenants, A, ['parent']);
    child = await createStudentLogin(tenants, A);
    secondChild = await createStudentLogin(tenants, A);
    unconsented = await createStudentLogin(tenants, A);
    stranger = await createStudentLogin(tenants, A);
    await linkGuardianRow(tenants, A, child.studentId, parent.userId, new Date());
    await linkGuardianRow(tenants, A, secondChild.studentId, parent.userId, new Date());
    await linkGuardianRow(tenants, A, unconsented.studentId, parent.userId, null);
    packageId = await createPriceItemRow(tenants, A, { amountMinor: 10_000 });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  it('reads the balance and ledger of a linked student with consent only', async () => {
    const ok = await http.get(`/v1/students/${child.studentId}/balance`).set(parent.headers);
    expect(ok.status, JSON.stringify(ok.body)).toBe(StatusCodes.OK);
    expect(ok.body).toMatchObject({ studentId: child.studentId, balanceMinutes: 0 });
    const ledger = await http.get(`/v1/students/${child.studentId}/ledger`).set(parent.headers);
    expect(ledger.status).toBe(StatusCodes.OK);
    for (const other of [unconsented, stranger]) {
      const denied = await http.get(`/v1/students/${other.studentId}/balance`).set(parent.headers);
      expect(denied.status).toBe(StatusCodes.NOT_FOUND);
    }
  });

  it('opens the shop for a chosen linked student, and asks to choose among several', async () => {
    const shop = await http.get(`/v1/shop?studentId=${secondChild.studentId}`).set(parent.headers);
    expect(shop.status, JSON.stringify(shop.body)).toBe(StatusCodes.OK);
    expect(shop.body.studentId).toBe(secondChild.studentId);
    expect(
      (await http.get(`/v1/shop?studentId=${stranger.studentId}`).set(parent.headers)).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await http.get('/v1/shop').set(parent.headers)).status).toBe(StatusCodes.BAD_REQUEST);
  });

  it('checks out for a linked student and lists that student’s invoices', async () => {
    const res = await http
      .post('/v1/checkout')
      .set(parent.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ priceItemId: packageId, studentId: child.studentId });
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    const denied = await http
      .post('/v1/checkout')
      .set(parent.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ priceItemId: packageId, studentId: unconsented.studentId });
    expect(denied.status).toBe(StatusCodes.NOT_FOUND);
    const invoices = await http
      .get(`/v1/invoices?studentId=${child.studentId}`)
      .set(parent.headers);
    expect(invoices.status, JSON.stringify(invoices.body)).toBe(StatusCodes.OK);
    expect(
      (await http.get(`/v1/invoices?studentId=${stranger.studentId}`).set(parent.headers)).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it('keeps students to their own records', async () => {
    expect(
      (await http.get(`/v1/students/${child.studentId}/balance`).set(child.headers)).status,
    ).toBe(StatusCodes.OK);
    expect(
      (await http.get(`/v1/students/${stranger.studentId}/balance`).set(child.headers)).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });
});
