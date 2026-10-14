import { randomUUID } from 'node:crypto';
import { LessonCancelled } from '@driveos/shared';
import { and, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { entitlements, ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { lessons } from '../../src/modules/scheduling/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { assignInstructor, createLogin, linkGuardianRow, type Login } from '../training/support.js';
import {
  insertLesson,
  insertLessonType,
  insertStudent,
  insertVehicle,
  insertWeekdayAvailability,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const HOUR = 3_600_000;
const NOW = new Date(Math.floor(Date.now() / 60_000) * 60_000);

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

describe('POST /v1/lessons/:id/cancel', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let office: Login;
  let ingo: Login;
  let ina: Login;
  let stellaLogin: Login;
  let soraLogin: Login;
  let parent: Login;
  let stella: string;
  let sora: string;
  let sam: string;
  let car: string;
  let standard: string;
  let examType: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A } = tenants);
    http = request(kernel.app.getHttpServer());
    office = await createLogin(tenants, A, ['office']);
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    stellaLogin = await createLogin(tenants, A, ['student']);
    soraLogin = await createLogin(tenants, A, ['student']);
    parent = await createLogin(tenants, A, ['parent']);
    stella = await insertStudent(tenants, A, 'Stella Student', stellaLogin.userId);
    sora = await insertStudent(tenants, A, 'Sora Student', soraLogin.userId);
    sam = await insertStudent(tenants, A, 'Sam Schulz');
    await linkGuardianRow(tenants, A, sam, parent.userId, new Date());
    await assignInstructor(tenants, A, stella, ingo.membershipId);
    for (const id of [stella, sora, sam]) await credit(id, 1000);
    car = await insertVehicle(tenants, A, 'B-DS 101');
    standard = await insertLessonType(tenants, A, { name: 'Standard lesson' });
    examType = await insertLessonType(tenants, A, {
      name: 'Exam',
      kind: 'exam',
      minutes: 90,
      creditMinutes: 90,
      requiresVehicle: true,
      requiresEntitlement: 'exam_car',
    });
    await insertWeekdayAvailability(tenants, A, ingo.membershipId);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await kernel?.close();
    await db?.drop();
  });

  function cancel(headers: Record<string, string>, id: string, body: Record<string, unknown> = {}) {
    return http.post(`/v1/lessons/${id}/cancel`).set(headers).send(body);
  }

  async function credit(studentId: string, minutes: number): Promise<void> {
    await tenants.asSchool(A, (tx) =>
      tx.insert(ledgerEntries).values({
        schoolId: A.schoolId,
        studentId,
        entryType: 'adjustment',
        minutes,
        note: 'test credit',
        createdByMembershipId: A.ownerMembershipId,
      }),
    );
  }

  async function balance(studentId: string): Promise<number> {
    const [row] = await tenants.asSchool(A, (tx) =>
      tx
        .select({ total: sql<string>`coalesce(sum(${ledgerEntries.minutes}), 0)` })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.studentId, studentId)),
    );
    return Number(row?.total);
  }

  function lesson(studentId: string, instructor: Login, start: string, lessonTypeId = standard) {
    return insertLesson(tenants, A, {
      studentId,
      instructorMembershipId: instructor.membershipId,
      lessonTypeId,
      start,
    });
  }

  describe('cancellation window', () => {
    it('a student cancelling exactly at the window gets the minutes back', async () => {
      const id = await lesson(stella, ingo, at(24 * HOUR));
      const before = await balance(stella);
      const res = await cancel(stellaLogin.headers, id, { reason: 'Ill' });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ id, version: 2, late: false, minutesRestored: 60 });
      expect(await balance(stella)).toBe(before + 60);
    });

    it('a student cancelling 1 s inside the window is late and restores nothing', async () => {
      const id = await lesson(sora, ina, at(24 * HOUR - 1000));
      const before = await balance(sora);
      const res = await cancel(soraLogin.headers, id);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ late: true, minutesRestored: 0 });
      expect(await balance(sora)).toBe(before);
      const [row] = await tenants.asSchool(A, (tx) =>
        tx.select().from(lessons).where(eq(lessons.id, id)),
      );
      expect(row).toMatchObject({ status: 'cancelled', lateCancel: true });
    });
  });

  describe('staff cancellation', () => {
    it('office cancelling inside the window restores in full and is not late', async () => {
      const id = await lesson(sam, ingo, at(2 * HOUR));
      const before = await balance(sam);
      const res = await cancel(office.headers, id);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ late: false, minutesRestored: 60 });
      expect(await balance(sam)).toBe(before + 60);
    });

    it('office may keep the credit inside the window, which is audited', async () => {
      const id = await lesson(sam, ingo, at(4 * HOUR));
      const before = await balance(sam);
      const res = await cancel(office.headers, id, { restoreCredit: false, reason: 'No call' });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ late: true, minutesRestored: 0 });
      expect(await balance(sam)).toBe(before);
      const client = new pg.Client({ connectionString: db.systemUrl });
      await client.connect();
      try {
        const { rows } = await client.query<{ action: string; reason: string }>(
          'select action, reason from audit_log where target_id = $1',
          [id],
        );
        expect(rows).toEqual([{ action: 'lesson.late_cancel_kept', reason: 'No call' }]);
      } finally {
        await client.end();
      }
    });

    it('rejects restoreCredit from a student, an instructor, or outside the window', async () => {
      const id = await lesson(stella, ingo, '2030-02-04T10:00:00.000Z');
      for (const [headers, restoreCredit] of [
        [stellaLogin.headers, true],
        [stellaLogin.headers, false],
        [ingo.headers, false],
        [office.headers, false],
      ] as const) {
        const res = await cancel(headers, id, { restoreCredit });
        expect(res.status).toBe(StatusCodes.BAD_REQUEST);
        expect(res.body.error.code).toBe('validation_error');
      }
    });
  });

  describe('who may cancel', () => {
    it('an instructor cancels in their own diary but not in another diary', async () => {
      const id = await lesson(sam, ingo, '2030-02-05T10:00:00.000Z');
      expect((await cancel(ina.headers, id)).status).toBe(StatusCodes.NOT_FOUND);
      const before = await balance(sam);
      const res = await cancel(ingo.headers, id);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ late: false, minutesRestored: 60 });
      expect(await balance(sam)).toBe(before + 60);
    });

    it('a parent cancels a linked student lesson; another student gets 404', async () => {
      const id = await lesson(sam, ina, at(48 * HOUR));
      expect((await cancel(stellaLogin.headers, id)).status).toBe(StatusCodes.NOT_FOUND);
      const res = await cancel(parent.headers, id);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ late: false, minutesRestored: 60 });
    });
  });

  describe('conflicts', () => {
    it('rejects a second cancel and a stale version', async () => {
      const id = await lesson(sam, ingo, '2030-02-06T10:00:00.000Z');
      const stale = await cancel(office.headers, id, { version: 7 });
      expect(stale.status).toBe(StatusCodes.CONFLICT);
      expect(stale.body.error.code).toBe('version_conflict');
      expect(stale.body.error.details.serverVersion).toMatchObject({ id, version: 1 });
      expect((await cancel(office.headers, id, { version: 1 })).status).toBe(StatusCodes.OK);
      const again = await cancel(office.headers, id);
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(again.body.error.code).toBe('lesson_not_booked');
    });
  });

  it('cancelling an exam lesson releases the exam_car entitlement', async () => {
    const eva = await insertStudent(tenants, A, 'Eva Exam');
    const id = await insertLesson(tenants, A, {
      studentId: eva,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: examType,
      vehicleId: car,
      start: '2030-02-07T10:00:00.000Z',
      minutes: 90,
    });
    await tenants.asSchool(A, (tx) =>
      tx.insert(entitlements).values({
        schoolId: A.schoolId,
        studentId: eva,
        kind: 'exam_car',
        grantedAt: new Date(),
        consumedAt: new Date(),
        consumedByLessonId: id,
      }),
    );
    expect((await cancel(office.headers, id)).status).toBe(StatusCodes.OK);
    const [entitlement] = await tenants.asSchool(A, (tx) =>
      tx
        .select()
        .from(entitlements)
        .where(and(eq(entitlements.studentId, eva), eq(entitlements.kind, 'exam_car'))),
    );
    expect(entitlement).toMatchObject({ consumedAt: null, consumedByLessonId: null });
  });

  it('appends LessonCancelled and frees the slot for a new booking', async () => {
    const body = {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: '2030-01-07T09:00:00.000Z',
      pickupAddress: 'Torstr. 1',
      pickupLat: 52.53,
      pickupLng: 13.4,
    };
    const book = () =>
      http.post('/v1/lessons').set(office.headers).set('Idempotency-Key', randomUUID()).send(body);
    const booked = await book();
    expect(booked.status).toBe(StatusCodes.CREATED);
    const id: string = booked.body.id;
    const res = await cancel(office.headers, id, { reason: 'Instructor ill' });
    expect(res.body).toEqual({ id, version: 2, late: false, minutesRestored: 60 });
    const event = await expectEventAppended(
      db,
      { type: LessonCancelled, aggregateId: id },
      { count: 1 },
    );
    expect(event.aggregateVersion).toBe(2);
    expect(event.payload).toEqual({
      lessonId: id,
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      vehicleId: null,
      lessonTypeId: standard,
      creditMinutes: 60,
      start: '2030-01-07T09:00:00.000Z',
      end: '2030-01-07T10:00:00.000Z',
      late: false,
      byRole: 'office',
      minutesRestored: 60,
      cancelledByMembershipId: office.membershipId,
      reason: 'Instructor ill',
    });
    expect((await book()).status).toBe(StatusCodes.CREATED);
  });
});
