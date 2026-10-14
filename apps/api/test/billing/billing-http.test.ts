import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import {
  GrantEntitlementCommand,
  LEDGER_WRITER,
  type LedgerWriter,
} from '../../src/modules/billing/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent } from '../identity/support.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import {
  createLesson,
  createPaymentRow,
  createStaffLogin,
  createStudentLogin,
  type StudentLogin,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

describe('billing HTTP: price items, shop, balance, ledger, adjustments', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let ledger: LedgerWriter;
  let tenant: TenantContext;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenant = kernel.app.get(TenantContext);
    tenants = await createTestTenants(db, { context: tenant });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    ledger = kernel.app.get<LedgerWriter>(LEDGER_WRITER);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const lessonItem = {
    name: 'Single lesson',
    kind: 'lesson',
    creditMinutes: 60,
    amountMinor: 6500,
    currency: 'EUR',
    taxRateBp: 1900,
    sortOrder: 2,
  };

  async function createItem(body: Record<string, unknown>, as: TestTenant = A) {
    const res = await http.post('/v1/price-items').set(authHeaders(as)).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    return res.body.id as string;
  }

  async function adjust(
    studentId: string,
    minutes: number,
    headers: Record<string, string> = authHeaders(A),
    extra: Record<string, unknown> = {},
  ) {
    return http
      .post('/v1/ledger/adjustments')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ studentId, minutes, note: 'test', reason: 'test reason', ...extra });
  }

  const issuePaths = (res: { body: { error: { details?: { issues?: { path: string[] }[] } } } }) =>
    (res.body.error.details?.issues ?? []).map((issue) => issue.path.join('.'));

  describe('price items', () => {
    it('creates, lists and updates a price item, bumping its version', async () => {
      const created = await http.post('/v1/price-items').set(authHeaders(A)).send(lessonItem);
      expect(created.status).toBe(StatusCodes.CREATED);
      expect(created.body).toEqual({ id: expect.any(String), version: 1 });

      const list = await http
        .get('/v1/price-items?kind=lesson')
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(list.body.items).toContainEqual({
        id: created.body.id,
        ...lessonItem,
        entitlementKind: null,
        active: true,
        showOnPublicPage: false,
      });

      const patched = await http
        .patch(`/v1/price-items/${created.body.id}`)
        .set(authHeaders(A))
        .send({ amountMinor: 7000, active: false })
        .expect(StatusCodes.OK);
      expect(patched.body).toEqual({ id: created.body.id, version: 2 });
      const inactive = await http.get('/v1/price-items?active=false').set(authHeaders(A));
      expect(inactive.body.items).toContainEqual(
        expect.objectContaining({ id: created.body.id, amountMinor: 7000, active: false }),
      );
    });

    it('pages price items with a cursor', async () => {
      const ids = [
        await createItem({ ...lessonItem, name: 'Page 1' }, B),
        await createItem({ ...lessonItem, name: 'Page 2' }, B),
        await createItem({ ...lessonItem, name: 'Page 3' }, B),
      ];
      const first = await http
        .get('/v1/price-items?limit=2')
        .set(authHeaders(B))
        .expect(StatusCodes.OK);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await http
        .get(`/v1/price-items?limit=2&cursor=${first.body.nextCursor}`)
        .set(authHeaders(B))
        .expect(StatusCodes.OK);
      const seen = [...first.body.items, ...second.body.items].map(
        (item: { id: string }) => item.id,
      );
      expect(seen).toEqual(expect.arrayContaining(ids));
    });

    it('refuses a currency other than the school currency', async () => {
      const res = await http
        .post('/v1/price-items')
        .set(authHeaders(A))
        .send({ ...lessonItem, currency: 'USD' })
        .expect(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
      expect(issuePaths(res)).toEqual(['currency']);
    });

    it('keeps the tax rate within 0..10000 basis points', async () => {
      const res = await http
        .post('/v1/price-items')
        .set(authHeaders(A))
        .send({ ...lessonItem, taxRateBp: 10_001 })
        .expect(StatusCodes.BAD_REQUEST);
      expect(issuePaths(res)).toEqual(['taxRateBp']);
      await http
        .patch(`/v1/price-items/${await createItem(lessonItem)}`)
        .set(authHeaders(A))
        .send({ taxRateBp: -1 })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it('needs credit minutes for a package and an entitlement kind for an upsell', async () => {
      const pkg = await http
        .post('/v1/price-items')
        .set(authHeaders(A))
        .send({ ...lessonItem, kind: 'package', creditMinutes: null })
        .expect(StatusCodes.BAD_REQUEST);
      expect(issuePaths(pkg)).toEqual(['creditMinutes']);
      const upsell = await http
        .post('/v1/price-items')
        .set(authHeaders(A))
        .send({ ...lessonItem, kind: 'upsell', creditMinutes: null })
        .expect(StatusCodes.BAD_REQUEST);
      expect(issuePaths(upsell)).toEqual(['entitlementKind']);
    });

    it('validates a patch against the stored item', async () => {
      const id = await createItem(lessonItem);
      const res = await http
        .patch(`/v1/price-items/${id}`)
        .set(authHeaders(A))
        .send({ creditMinutes: null })
        .expect(StatusCodes.BAD_REQUEST);
      expect(issuePaths(res)).toEqual(['creditMinutes']);
      await http
        .patch(`/v1/price-items/${id}`)
        .set(authHeaders(A))
        .send({ entitlementKind: 'exam_car' })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it("answers 404 for an unknown or another school's price item", async () => {
      const id = await createItem(lessonItem);
      await http
        .patch(`/v1/price-items/${id}`)
        .set(authHeaders(B))
        .send({ name: 'Hijacked' })
        .expect(StatusCodes.NOT_FOUND);
      await http
        .patch(`/v1/price-items/${randomUUID()}`)
        .set(authHeaders(A))
        .send({ name: 'Nobody' })
        .expect(StatusCodes.NOT_FOUND);
    });

    it('lets office read but not change prices; students may not list them', async () => {
      const office = await createStaffLogin(tenants, A, ['office']);
      await http.get('/v1/price-items').set(office).expect(StatusCodes.OK);
      await http.post('/v1/price-items').set(office).send(lessonItem).expect(StatusCodes.FORBIDDEN);
      const student = await createStudentLogin(tenants, A);
      await http.get('/v1/price-items').set(student.headers).expect(StatusCodes.FORBIDDEN);
    });

    it('lets an instructor list price items (cash screen) but not change them', async () => {
      const itemId = await createItem(lessonItem);
      const instructor = await createStaffLogin(tenants, A, ['instructor']);
      const res = await http.get('/v1/price-items').set(instructor).expect(StatusCodes.OK);
      expect(res.body.items.map((item: { id: string }) => item.id)).toContain(itemId);
      await http
        .post('/v1/price-items')
        .set(instructor)
        .send(lessonItem)
        .expect(StatusCodes.FORBIDDEN);
      await http
        .patch(`/v1/price-items/${itemId}`)
        .set(instructor)
        .send({ name: 'Cheaper' })
        .expect(StatusCodes.FORBIDDEN);
    });
  });

  describe('shop', () => {
    let shopper: StudentLogin;
    let premiumId: string;
    let examCarId: string;
    let inactiveId: string;

    beforeAll(async () => {
      shopper = await createStudentLogin(tenants, B);
      premiumId = await createItem(
        {
          ...lessonItem,
          name: 'Premium theory',
          kind: 'upsell',
          creditMinutes: null,
          entitlementKind: 'premium_theory',
          sortOrder: 1,
        },
        B,
      );
      examCarId = await createItem(
        {
          ...lessonItem,
          name: 'Exam car',
          kind: 'upsell',
          creditMinutes: null,
          entitlementKind: 'exam_car',
          sortOrder: 0,
        },
        B,
      );
      inactiveId = await createItem({ ...lessonItem, name: 'Old', active: false }, B);
      await executeAs(
        kernel.app,
        B,
        new GrantEntitlementCommand({ studentId: shopper.studentId, kind: 'premium_theory' }),
      );
      await tenant.runInTenant({ schoolId: B.schoolId, userId: B.ownerUserId }, () =>
        ledger.adjust({
          studentId: shopper.studentId,
          minutes: 90,
          note: 'start',
          createdByMembershipId: B.ownerMembershipId,
        }),
      );
    });

    it('shows a student the active items in sort order with their balance and what they own', async () => {
      const res = await http.get('/v1/shop').set(shopper.headers).expect(StatusCodes.OK);
      expect(res.body).toMatchObject({
        studentId: shopper.studentId,
        checkoutEnabled: false,
        balanceMinutes: 90,
      });
      const ids = res.body.items.map((item: { id: string }) => item.id);
      expect(ids).not.toContain(inactiveId);
      expect(ids.indexOf(examCarId)).toBeLessThan(ids.indexOf(premiumId));
      expect(res.body.items).toContainEqual(
        expect.objectContaining({ id: premiumId, owned: true, entitlementKind: 'premium_theory' }),
      );
      expect(res.body.items).toContainEqual(
        expect.objectContaining({ id: examCarId, owned: false }),
      );
    });

    it("never shows a student another student's shop", async () => {
      const other = await createStudentLogin(tenants, B);
      await http
        .get(`/v1/shop?studentId=${other.studentId}`)
        .set(shopper.headers)
        .expect(StatusCodes.NOT_FOUND);
      await http
        .get(`/v1/shop?studentId=${shopper.studentId}`)
        .set(shopper.headers)
        .expect(StatusCodes.OK);
    });

    it('lets staff open the shop for a student and enables checkout with an active account', async () => {
      await http.get('/v1/shop').set(authHeaders(B)).expect(StatusCodes.BAD_REQUEST);
      await http
        .post('/v1/school/payment-account')
        .set(authHeaders(B))
        .send({ provider: 'fake' })
        .expect(StatusCodes.OK);
      const res = await http
        .get(`/v1/shop?studentId=${shopper.studentId}`)
        .set(authHeaders(B))
        .expect(StatusCodes.OK);
      expect(res.body).toMatchObject({ studentId: shopper.studentId, checkoutEnabled: true });
    });
  });

  describe('balance and ledger', () => {
    it('sums a purchase/debit/restore/adjust cycle and lists it newest first', async () => {
      const student = await createStudentLogin(tenants, A);
      const studentId = student.studentId;
      const lessonId = await createLesson(tenants, A, studentId);
      const paymentId = await createPaymentRow(tenants, A, studentId);
      const priceItemId = await createItem({ ...lessonItem, kind: 'package', creditMinutes: 600 });
      await tenant.runInTenant({ schoolId: A.schoolId, userId: A.ownerUserId }, async () => {
        await ledger.lockStudent(studentId);
        await ledger.credit({ studentId, minutes: 600, paymentId, priceItemId });
        await ledger.debit({ studentId, minutes: 60, lessonId });
        await ledger.restore({ studentId, minutes: 60, lessonId });
        await ledger.debit({ studentId, minutes: 60, lessonId });
      });
      const adjusted = await adjust(studentId, -40);
      expect(adjusted.status).toBe(StatusCodes.CREATED);
      expect(adjusted.body).toEqual({ id: expect.any(String), balanceAfter: 500 });

      const balance = await http
        .get(`/v1/students/${studentId}/balance`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(balance.body).toEqual({ studentId, balanceMinutes: 500, entitlements: [] });
      const own = await http
        .get(`/v1/students/${studentId}/balance`)
        .set(student.headers)
        .expect(StatusCodes.OK);
      expect(own.body.balanceMinutes).toBe(500);

      const page1 = await http
        .get(`/v1/students/${studentId}/ledger?limit=3`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(
        page1.body.items.map((e: { entryType: string; minutes: number; balanceAfter: number }) => [
          e.entryType,
          e.minutes,
          e.balanceAfter,
        ]),
      ).toEqual([
        ['adjustment', -40, 500],
        ['debit', -60, 540],
        ['restore', 60, 600],
      ]);
      expect(page1.body.items[0]).toMatchObject({
        id: adjusted.body.id,
        note: 'test',
        createdByMembershipId: A.ownerMembershipId,
        lessonId: null,
      });
      const page2 = await http
        .get(`/v1/students/${studentId}/ledger?limit=3&cursor=${page1.body.nextCursor}`)
        .set(student.headers)
        .expect(StatusCodes.OK);
      expect(
        page2.body.items.map((e: { entryType: string; balanceAfter: number }) => [
          e.entryType,
          e.balanceAfter,
        ]),
      ).toEqual([
        ['debit', 540],
        ['purchase', 600],
      ]);
      expect(page2.body.items[1]).toMatchObject({ paymentId, priceItemId });
      expect(page2.body.nextCursor).toBeNull();
    });

    it('lists active entitlements with the balance', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2001-02-03' });
      const granted = await executeAs(
        kernel.app,
        A,
        new GrantEntitlementCommand({ studentId, kind: 'exam_car' }),
      );
      const res = await http
        .get(`/v1/students/${studentId}/balance`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(res.body.entitlements).toEqual([
        { id: granted.id, kind: 'exam_car', paymentId: null, grantedAt: expect.any(String) },
      ]);
    });

    it('lets a student read only their own balance and ledger', async () => {
      const me = await createStudentLogin(tenants, A);
      const other = await createStudentLogin(tenants, A);
      await http
        .get(`/v1/students/${other.studentId}/balance`)
        .set(me.headers)
        .expect(StatusCodes.NOT_FOUND);
      await http
        .get(`/v1/students/${other.studentId}/ledger`)
        .set(me.headers)
        .expect(StatusCodes.NOT_FOUND);
      await http
        .get(`/v1/students/${randomUUID()}/balance`)
        .set(authHeaders(A))
        .expect(StatusCodes.NOT_FOUND);
    });

    it('rejects a cursor that is not an entry id', async () => {
      const me = await createStudentLogin(tenants, A);
      await http
        .get(`/v1/students/${me.studentId}/ledger?cursor=nope`)
        .set(me.headers)
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('adjustments', () => {
    it('writes the entry, audits it and replays with the same Idempotency-Key', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
      const key = randomUUID();
      const body = { studentId, minutes: 120, note: 'goodwill', reason: 'instructor was late' };
      const first = await http
        .post('/v1/ledger/adjustments')
        .set(authHeaders(A))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(StatusCodes.CREATED);
      const replay = await http
        .post('/v1/ledger/adjustments')
        .set(authHeaders(A))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(StatusCodes.CREATED);
      expect(replay.body).toEqual(first.body);
      expect(first.body.balanceAfter).toBe(120);

      const audit = await tenants.asSchool(A, (tx) =>
        tx.execute<{ action: string; target_type: string; target_id: string; reason: string }>(
          sql`select action, target_type, target_id, reason from audit_log
              where target_id = ${studentId}::uuid`,
        ),
      );
      expect(audit.rows).toEqual([
        {
          action: 'ledger.adjust',
          target_type: 'student',
          target_id: studentId,
          reason: 'instructor was late',
        },
      ]);
      const balance = await http
        .get(`/v1/students/${studentId}/balance`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(balance.body.balanceMinutes).toBe(120);
    });

    it('refuses to take the balance below zero unless the school allows it', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
      expect((await adjust(studentId, 30)).status).toBe(StatusCodes.CREATED);
      const refused = await adjust(studentId, -31);
      expect(refused.status).toBe(StatusCodes.CONFLICT);
      expect(refused.body.error.code).toBe('insufficient_balance');
      expect((await adjust(studentId, -30)).body.balanceAfter).toBe(0);

      await http
        .patch('/v1/school/settings')
        .set(authHeaders(A))
        .send({ allowNegativeBalance: true })
        .expect(StatusCodes.OK);
      try {
        const allowed = await adjust(studentId, -45);
        expect(allowed.status).toBe(StatusCodes.CREATED);
        expect(allowed.body.balanceAfter).toBe(-45);
      } finally {
        await http
          .patch('/v1/school/settings')
          .set(authHeaders(A))
          .send({ allowNegativeBalance: false })
          .expect(StatusCodes.OK);
      }
    });

    it("answers 404 for another school's student and writes nothing", async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
      const res = await adjust(studentId, 60, authHeaders(B));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      const rows = await tenants.asSystem((tx) =>
        tx.execute(sql`select 1 from ledger_entries where student_id = ${studentId}::uuid`),
      );
      expect(rows.rows).toHaveLength(0);
    });

    it('links a late-cancel override to a lesson of that student only', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
      const lessonId = await createLesson(tenants, A, studentId);
      const otherLessonId = await createLesson(
        tenants,
        A,
        await createStudent(tenants, A, { dateOfBirth: '2000-01-01' }),
      );
      const res = await adjust(studentId, 60, authHeaders(A), { lessonId });
      expect(res.status).toBe(StatusCodes.CREATED);
      const entry = await http
        .get(`/v1/students/${studentId}/ledger`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(entry.body.items[0]).toMatchObject({ entryType: 'adjustment', lessonId });
      expect(
        (await adjust(studentId, 60, authHeaders(A), { lessonId: otherLessonId })).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });

    it('lets office adjust and forbids instructors and students', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
      const office = await createStaffLogin(tenants, A, ['office']);
      expect((await adjust(studentId, 15, office)).status).toBe(StatusCodes.CREATED);
      const instructor = await createStaffLogin(tenants, A, ['instructor']);
      const denied = await adjust(studentId, 15, instructor);
      expect(denied.status).toBe(StatusCodes.FORBIDDEN);
      expect(denied.body.error.details).toEqual({ permission: 'ledger.adjust' });
      const student = await createStudentLogin(tenants, A);
      expect((await adjust(student.studentId, 15, student.headers)).status).toBe(
        StatusCodes.FORBIDDEN,
      );
    });
  });
});
