import { randomUUID } from 'node:crypto';
import { LessonBooked, type LessonResponse } from '@driveos/shared';
import { and, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { entitlements, ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { lessons, timeOff } from '../../src/modules/scheduling/infra/schema.js';
import { schoolSettings } from '../../src/modules/school/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { assignInstructor, createLogin, linkGuardianRow, type Login } from '../training/support.js';
import {
  insertLesson,
  insertLessonType,
  insertStudent,
  insertVehicle,
  insertWeekdayAvailability,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

async function waitForLockWaiters(client: pg.Client, count: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await client.query<{ waiting: number }>(
      "select count(*)::int as waiting from pg_locks where locktype = 'advisory' and not granted",
    );
    if ((rows[0]?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Fewer than ${count} bookings waited for the ledger lock`);
}

const PICKUP = { pickupAddress: 'Torstr. 1', pickupLat: 52.53, pickupLng: 13.4 };

describe('POST /v1/lessons (book)', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let owner: Record<string, string>;
  let office: Login;
  let ingo: Login;
  let ina: Login;
  let stellaLogin: Login;
  let parent: Login;
  let stella: string;
  let sam: string;
  let car: string;
  let standard: string;
  let carType: string;
  let examType: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A } = tenants);
    http = request(kernel.app.getHttpServer());
    owner = authHeaders(A);
    office = await createLogin(tenants, A, ['office']);
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    stellaLogin = await createLogin(tenants, A, ['student']);
    parent = await createLogin(tenants, A, ['parent']);
    stella = await insertStudent(tenants, A, 'Stella Student', stellaLogin.userId);
    sam = await insertStudent(tenants, A, 'Sam Schulz');
    await linkGuardianRow(tenants, A, sam, parent.userId, new Date());
    await assignInstructor(tenants, A, stella, ingo.membershipId);
    await credit(stella, 1000);
    await credit(sam, 1000);
    car = await insertVehicle(tenants, A, 'B-DS 101');
    standard = await insertLessonType(tenants, A, { name: 'Standard lesson' });
    carType = await insertLessonType(tenants, A, { name: 'Car lesson', requiresVehicle: true });
    examType = await insertLessonType(tenants, A, {
      name: 'Exam',
      kind: 'exam',
      minutes: 90,
      creditMinutes: 90,
      requiresVehicle: true,
      requiresEntitlement: 'exam_car',
    });
    await insertWeekdayAvailability(tenants, A, ingo.membershipId);
    await insertWeekdayAvailability(tenants, A, ina.membershipId);
  });

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  function book(headers: Record<string, string>, body: Record<string, unknown>) {
    return http
      .post('/v1/lessons')
      .set(headers)
      .set('Idempotency-Key', randomUUID())
      .send({ ...PICKUP, ...body });
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

  async function setSettings(values: Partial<typeof schoolSettings.$inferInsert>): Promise<void> {
    await tenants.asSchool(A, (tx) =>
      tx.update(schoolSettings).set(values).where(eq(schoolSettings.schoolId, A.schoolId)),
    );
  }

  async function newStudent(name: string, minutes: number, userId: string | null = null) {
    const id = await insertStudent(tenants, A, name, userId);
    if (minutes !== 0) await credit(id, minutes);
    return id;
  }

  it('books for the office, debits the ledger and appends LessonBooked', async () => {
    const res = await book(office.headers, {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: carType,
      vehicleId: car,
      start: '2030-01-07T09:00:00.000Z',
    });
    expect(res.status).toBe(StatusCodes.CREATED);
    const lesson = res.body as LessonResponse;
    expect(lesson).toMatchObject({
      studentId: stella,
      studentName: 'Stella Student',
      instructorMembershipId: ingo.membershipId,
      vehicleId: car,
      vehiclePlate: 'B-DS 101',
      lessonTypeId: carType,
      lessonTypeName: 'Car lesson',
      lessonTypeKind: 'lesson',
      creditMinutes: 60,
      start: '2030-01-07T09:00:00.000Z',
      end: '2030-01-07T10:00:00.000Z',
      status: 'booked',
      bookedVia: 'office',
      bookedByMembershipId: office.membershipId,
      lateCancel: false,
      version: 1,
      ...PICKUP,
    });
    const event = await expectEventAppended(
      db,
      { type: LessonBooked, aggregateId: lesson.id },
      { count: 1 },
    );
    expect(event.aggregateType).toBe('lesson');
    expect(event.aggregateVersion).toBe(1);
    expect(event.payload).toMatchObject({
      lessonId: lesson.id,
      studentId: stella,
      creditMinutes: 60,
      start: lesson.start,
      end: lesson.end,
      bookedVia: 'office',
    });
    const debits = await tenants.asSchool(A, (tx) =>
      tx.select().from(ledgerEntries).where(eq(ledgerEntries.lessonId, lesson.id)),
    );
    expect(debits).toMatchObject([{ entryType: 'debit', minutes: -60, studentId: stella }]);
  });

  describe('clashes', () => {
    let other: string;
    let existing: string;
    beforeAll(async () => {
      other = await newStudent('Olga Other', 1000);
      existing = await insertLesson(tenants, A, {
        studentId: other,
        instructorMembershipId: ina.membershipId,
        lessonTypeId: carType,
        vehicleId: car,
        start: '2030-01-08T10:00:00.000Z',
      });
    });

    const conflict = {
      start: '2030-01-08T10:00:00.000Z',
      end: '2030-01-08T11:00:00.000Z',
    };

    it('rejects an instructor overlap with the conflicting period', async () => {
      const res = await book(owner, {
        studentId: sam,
        instructorMembershipId: ina.membershipId,
        lessonTypeId: standard,
        start: '2030-01-08T10:30:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error).toMatchObject({
        code: 'lesson_conflict',
        details: { ...conflict, lessonId: existing },
      });
    });

    it('rejects a vehicle overlap with the conflicting period', async () => {
      const res = await book(owner, {
        studentId: sam,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: carType,
        vehicleId: car,
        start: '2030-01-08T10:30:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error).toMatchObject({
        code: 'lesson_conflict',
        details: { ...conflict, lessonId: existing },
      });
    });

    it('rejects a student overlap with the conflicting period', async () => {
      const res = await book(owner, {
        studentId: other,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-08T10:30:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error).toMatchObject({
        code: 'lesson_conflict',
        details: { ...conflict, lessonId: existing },
      });
      expect(await balance(other)).toBe(1000);
    });

    it('lets a cancelled lesson free the slot', async () => {
      await insertLesson(tenants, A, {
        studentId: other,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-08T13:00:00.000Z',
        status: 'cancelled',
      });
      const res = await book(owner, {
        studentId: sam,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-08T13:00:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.CREATED);
    });
  });

  it('never overdraws with parallel student bookings and credit for one', async () => {
    const piaLogin = await createLogin(tenants, A, ['student']);
    const pia = await newStudent('Pia Parallel', 60, piaLogin.userId);
    const blocker = new pg.Client({ connectionString: db.systemUrl });
    await blocker.connect();
    try {
      await blocker.query('begin');
      await blocker.query("select pg_advisory_xact_lock(hashtext('ledger'), hashtext($1::text))", [
        pia,
      ]);
      const pending = Promise.all(
        ['09', '11', '13', '15'].map((hour) =>
          book(piaLogin.headers, {
            studentId: pia,
            instructorMembershipId: ina.membershipId,
            lessonTypeId: standard,
            start: `2030-01-09T${hour}:00:00.000Z`,
          }),
        ),
      );
      await waitForLockWaiters(blocker, 4);
      await blocker.query('commit');
      const results = await pending;
      expect(results.map((res) => res.status).sort()).toEqual([
        StatusCodes.CREATED,
        StatusCodes.CONFLICT,
        StatusCodes.CONFLICT,
        StatusCodes.CONFLICT,
      ]);
      for (const res of results.filter((res) => res.status === StatusCodes.CONFLICT)) {
        expect(res.body.error.code).toBe('insufficient_balance');
      }
      expect(await balance(pia)).toBe(0);
    } finally {
      await blocker.end();
    }
  });

  it('lets staff go negative only with allow_negative_balance', async () => {
    const ninaLogin = await createLogin(tenants, A, ['student']);
    const nina = await newStudent('Nina Negative', 0, ninaLogin.userId);
    const body = {
      studentId: nina,
      instructorMembershipId: ina.membershipId,
      lessonTypeId: standard,
      start: '2030-01-10T09:00:00.000Z',
    };
    const off = await book(office.headers, body);
    expect(off.status).toBe(StatusCodes.CONFLICT);
    expect(off.body.error.code).toBe('insufficient_balance');

    await setSettings({ allowNegativeBalance: true });
    try {
      const own = await book(ninaLogin.headers, body);
      expect(own.status).toBe(StatusCodes.CONFLICT);
      expect(own.body.error.code).toBe('insufficient_balance');
      const on = await book(office.headers, body);
      expect(on.status).toBe(StatusCodes.CREATED);
      expect(await balance(nina)).toBe(-60);
    } finally {
      await setSettings({ allowNegativeBalance: false });
    }
  });

  describe('slot validation', () => {
    const stellaBody = (start: string) => ({
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start,
    });

    it('rejects a start outside availability', async () => {
      for (const start of ['2030-01-12T09:00:00.000Z', '2030-01-07T07:30:00.000Z']) {
        const res = await book(stellaLogin.headers, stellaBody(start));
        expect(res.status).toBe(StatusCodes.CONFLICT);
        expect(res.body.error).toMatchObject({
          code: 'slot_unavailable',
          details: { reason: 'outside_availability' },
        });
      }
      const late = await book(stellaLogin.headers, stellaBody('2030-01-07T15:30:00.000Z'));
      expect(late.body.error).toMatchObject({ details: { reason: 'outside_availability' } });
    });

    it('rejects a start inside time off', async () => {
      await tenants.asSchool(A, (tx) =>
        tx.insert(timeOff).values({
          schoolId: A.schoolId,
          instructorMembershipId: ingo.membershipId,
          period: {
            start: new Date('2030-01-11T08:00:00.000Z'),
            end: new Date('2030-01-11T12:00:00.000Z'),
          },
          reason: 'Dentist',
        }),
      );
      const res = await book(stellaLogin.headers, stellaBody('2030-01-11T09:00:00.000Z'));
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error).toMatchObject({
        code: 'slot_unavailable',
        details: { reason: 'outside_availability' },
      });
    });

    it('enforces the minimum gap to the instructor’s other lessons', async () => {
      await insertLesson(tenants, A, {
        studentId: sam,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-11T13:00:00.000Z',
      });
      await setSettings({ minGapMinutes: 30 });
      try {
        const tooClose = await book(stellaLogin.headers, stellaBody('2030-01-11T14:15:00.000Z'));
        expect(tooClose.status).toBe(StatusCodes.CONFLICT);
        expect(tooClose.body.error).toMatchObject({
          code: 'slot_unavailable',
          details: { reason: 'min_gap' },
        });
        const ok = await book(stellaLogin.headers, stellaBody('2030-01-11T14:30:00.000Z'));
        expect(ok.status).toBe(StatusCodes.CREATED);
        expect(ok.body.bookedVia).toBe('student');
      } finally {
        await setSettings({ minGapMinutes: 0 });
      }
    });

    it('rejects a start in the past', async () => {
      const res = await book(stellaLogin.headers, stellaBody('2020-01-06T09:00:00.000Z'));
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error).toMatchObject({
        code: 'slot_unavailable',
        details: { reason: 'in_past' },
      });
    });

    it('rejects a start that is not on a minute boundary', async () => {
      const res = await book(stellaLogin.headers, stellaBody('2030-01-07T11:00:30.000Z'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('requires a vehicle for a vehicle lesson type', async () => {
      const res = await book(owner, {
        ...stellaBody('2030-01-07T11:00:00.000Z'),
        lessonTypeId: carType,
      });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('rejects a lesson type of another licence class', async () => {
      const truck = await insertLessonType(tenants, A, { name: 'Truck', licenceClass: 'C' });
      const res = await book(owner, {
        ...stellaBody('2030-01-07T11:00:00.000Z'),
        lessonTypeId: truck,
      });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error).toMatchObject({
        code: 'slot_unavailable',
        details: { reason: 'licence_class' },
      });
    });

    it('returns 404 for an unknown lesson type, an inactive lesson type or an unknown vehicle', async () => {
      const inactive = await insertLessonType(tenants, A, { name: 'Old', active: false });
      for (const patch of [
        { lessonTypeId: randomUUID() },
        { lessonTypeId: inactive },
        { lessonTypeId: carType, vehicleId: randomUUID() },
      ]) {
        const res = await book(owner, { ...stellaBody('2030-01-07T11:00:00.000Z'), ...patch });
        expect(res.status).toBe(StatusCodes.NOT_FOUND);
      }
    });

    it('needs a pickup address from the body or the student', async () => {
      const res = await http
        .post('/v1/lessons')
        .set(owner)
        .set('Idempotency-Key', randomUUID())
        .send(stellaBody('2030-01-07T11:00:00.000Z'));
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
    });
  });

  describe('exam car entitlement', () => {
    let eva: string;
    const body = () => ({
      studentId: eva,
      instructorMembershipId: ina.membershipId,
      lessonTypeId: examType,
      vehicleId: car,
      start: '2030-01-14T09:00:00.000Z',
    });

    beforeAll(async () => {
      eva = await newStudent('Eva Exam', 300);
    });

    it('rejects an exam booking without an exam_car entitlement', async () => {
      const res = await book(owner, body());
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('entitlement_missing');
      const rows = await tenants.asSchool(A, (tx) =>
        tx.select().from(lessons).where(eq(lessons.studentId, eva)),
      );
      expect(rows).toEqual([]);
      expect(await balance(eva)).toBe(300);
    });

    it('consumes the exam_car entitlement', async () => {
      await tenants.asSchool(A, (tx) =>
        tx.insert(entitlements).values({
          schoolId: A.schoolId,
          studentId: eva,
          kind: 'exam_car',
          grantedAt: new Date(),
        }),
      );
      const res = await book(owner, body());
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({ lessonTypeKind: 'exam', creditMinutes: 90 });
      const [entitlement] = await tenants.asSchool(A, (tx) =>
        tx
          .select()
          .from(entitlements)
          .where(and(eq(entitlements.studentId, eva), eq(entitlements.kind, 'exam_car'))),
      );
      expect(entitlement?.consumedByLessonId).toBe(res.body.id);
      expect(entitlement?.consumedAt).not.toBeNull();
      expect(await balance(eva)).toBe(210);
    });
  });

  describe('who may book for whom', () => {
    it('forbids a student booking for another student', async () => {
      const res = await book(stellaLogin.headers, {
        studentId: sam,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-15T09:00:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('forbids a student booking an instructor they are not assigned to', async () => {
      const res = await book(stellaLogin.headers, {
        studentId: stella,
        instructorMembershipId: ina.membershipId,
        lessonTypeId: standard,
        start: '2030-01-15T09:00:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('lets a parent book for a consented linked student', async () => {
      const res = await book(parent.headers, {
        studentId: sam,
        instructorMembershipId: ina.membershipId,
        lessonTypeId: standard,
        start: '2030-01-15T09:00:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({
        bookedVia: 'parent',
        bookedByMembershipId: parent.membershipId,
      });
    });

    it('forbids a parent booking for a student they are not linked to', async () => {
      const res = await book(parent.headers, {
        studentId: stella,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-15T12:00:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('lets an instructor book an assigned student into their own diary only', async () => {
      const own = await book(ingo.headers, {
        studentId: stella,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-16T09:00:00.000Z',
      });
      expect(own.status).toBe(StatusCodes.CREATED);
      expect(own.body.bookedVia).toBe('instructor');
      const foreign = await book(ingo.headers, {
        studentId: stella,
        instructorMembershipId: ina.membershipId,
        lessonTypeId: standard,
        start: '2030-01-16T12:00:00.000Z',
      });
      expect(foreign.status).toBe(StatusCodes.FORBIDDEN);
      const unassigned = await book(ingo.headers, {
        studentId: sam,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-16T12:00:00.000Z',
      });
      expect(unassigned.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('returns 404 for an unknown student or a non-instructor', async () => {
      const unknown = await book(owner, {
        studentId: randomUUID(),
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-16T14:00:00.000Z',
      });
      expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
      const notInstructor = await book(owner, {
        studentId: stella,
        instructorMembershipId: office.membershipId,
        lessonTypeId: standard,
        start: '2030-01-16T14:00:00.000Z',
      });
      expect(notInstructor.status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
