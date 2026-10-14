import { LessonMoved } from '@driveos/shared';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { permissionGrants } from '../../src/modules/identity/infra/schema.js';
import { lessons } from '../../src/modules/scheduling/infra/schema.js';
import { schoolSettings } from '../../src/modules/school/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { assignInstructor, createLogin, type Login } from '../training/support.js';
import {
  insertLesson,
  insertLessonType,
  insertStudent,
  insertVehicle,
  insertWeekdayAvailability,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const HOUR = 3_600_000;

function soon(hours: number): string {
  return new Date(Math.floor((Date.now() + hours * HOUR) / 60_000) * 60_000).toISOString();
}

describe('PATCH /v1/lessons/:id (move)', () => {
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
  let stella: string;
  let sora: string;
  let sam: string;
  let standard: string;
  let long: string;
  let short: string;
  let examType: string;

  beforeAll(async () => {
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
    await tenants.asSchool(A, (tx) =>
      tx.insert(permissionGrants).values(
        [stellaLogin, soraLogin].map((login) => ({
          schoolId: A.schoolId,
          membershipId: login.membershipId,
          permission: 'lessons.move.own',
        })),
      ),
    );
    stella = await insertStudent(tenants, A, 'Stella Student', stellaLogin.userId);
    sora = await insertStudent(tenants, A, 'Sora Student', soraLogin.userId);
    sam = await insertStudent(tenants, A, 'Sam Schulz');
    await assignInstructor(tenants, A, stella, ingo.membershipId);
    for (const id of [stella, sam]) await credit(id, 1000);
    await credit(sora, 30);
    await insertVehicle(tenants, A, 'B-DS 101');
    standard = await insertLessonType(tenants, A, { name: 'Standard lesson' });
    long = await insertLessonType(tenants, A, { name: 'Long', minutes: 90, creditMinutes: 90 });
    short = await insertLessonType(tenants, A, { name: 'Short', minutes: 45, creditMinutes: 45 });
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

  function move(headers: Record<string, string>, id: string, body: Record<string, unknown>) {
    return http.patch(`/v1/lessons/${id}`).set(headers).send(body);
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

  async function entriesFor(lessonId: string) {
    return tenants.asSchool(A, (tx) =>
      tx
        .select({ entryType: ledgerEntries.entryType, minutes: ledgerEntries.minutes })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.lessonId, lessonId)),
    );
  }

  async function row(id: string) {
    const [found] = await tenants.asSchool(A, (tx) =>
      tx.select().from(lessons).where(eq(lessons.id, id)),
    );
    if (!found) throw new Error('lesson missing');
    return found;
  }

  function lesson(studentId: string, instructor: Login, start: string, lessonTypeId = standard) {
    return insertLesson(tenants, A, {
      studentId,
      instructorMembershipId: instructor.membershipId,
      lessonTypeId,
      start,
    });
  }

  it('lets the office move a lesson to a free slot and appends LessonMoved', async () => {
    const id = await lesson(stella, ingo, '2030-01-07T09:00:00.000Z');
    const before = await balance(stella);
    const res = await move(office.headers, id, { start: '2030-01-07T11:00:00.000Z' });
    expect(res.status).toBe(StatusCodes.OK);
    expect(res.body).toEqual({ id, version: 2 });
    const moved = await row(id);
    expect(moved.period.start.toISOString()).toBe('2030-01-07T11:00:00.000Z');
    expect(moved.period.end.toISOString()).toBe('2030-01-07T12:00:00.000Z');
    expect(await balance(stella)).toBe(before);
    const event = await expectEventAppended(db, { type: LessonMoved, aggregateId: id });
    expect(event.aggregateVersion).toBe(2);
    expect(event.payload).toMatchObject({
      lessonId: id,
      start: '2030-01-07T11:00:00.000Z',
      previousStart: '2030-01-07T09:00:00.000Z',
      previousEnd: '2030-01-07T10:00:00.000Z',
      previousInstructorMembershipId: ingo.membershipId,
      creditMinutesDelta: 0,
      lateCancellation: false,
      movedByMembershipId: office.membershipId,
    });
  });

  it('lets the office hand a lesson to another instructor', async () => {
    const id = await lesson(sam, ingo, '2030-01-07T13:00:00.000Z');
    const res = await move(office.headers, id, { instructorMembershipId: ina.membershipId });
    expect(res.status).toBe(StatusCodes.OK);
    expect((await row(id)).instructorMembershipId).toBe(ina.membershipId);
  });

  it('returns 409 lesson_conflict with the conflicting period and leaves the lesson alone', async () => {
    await lesson(stella, ingo, '2030-01-08T09:00:00.000Z');
    const id = await lesson(sam, ingo, '2030-01-08T12:00:00.000Z');
    const res = await move(office.headers, id, { start: '2030-01-08T09:30:00.000Z' });
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error).toMatchObject({
      code: 'lesson_conflict',
      details: { start: '2030-01-08T09:00:00.000Z', end: '2030-01-08T10:00:00.000Z' },
    });
    const unchanged = await row(id);
    expect(unchanged.version).toBe(1);
    expect(unchanged.period.start.toISOString()).toBe('2030-01-08T12:00:00.000Z');
  });

  it('reports the other lesson, not the moved one, as the conflict', async () => {
    const id = await lesson(stella, ingo, '2030-01-15T09:00:00.000Z');
    await lesson(sam, ingo, '2030-01-15T10:00:00.000Z');
    const res = await move(office.headers, id, { start: '2030-01-15T09:30:00.000Z' });
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error.details).toMatchObject({
      start: '2030-01-15T10:00:00.000Z',
      end: '2030-01-15T11:00:00.000Z',
    });
  });

  it('ignores the moved lesson itself in the min-gap check', async () => {
    const id = await lesson(sam, ina, '2030-01-16T09:00:00.000Z');
    await tenants.asSchool(A, (tx) =>
      tx
        .update(schoolSettings)
        .set({ minGapMinutes: 15 })
        .where(eq(schoolSettings.schoolId, A.schoolId)),
    );
    try {
      const res = await move(office.headers, id, { start: '2030-01-16T10:05:00.000Z' });
      expect(res.status).toBe(StatusCodes.OK);
    } finally {
      await tenants.asSchool(A, (tx) =>
        tx
          .update(schoolSettings)
          .set({ minGapMinutes: 0 })
          .where(eq(schoolSettings.schoolId, A.schoolId)),
      );
    }
  });

  it('moves a lesson so that it overlaps its own old period', async () => {
    const id = await lesson(sam, ina, '2030-01-08T13:00:00.000Z');
    const res = await move(office.headers, id, { start: '2030-01-08T13:30:00.000Z' });
    expect(res.status).toBe(StatusCodes.OK);
  });

  it('resizes to a dearer type with an extra debit and to a cheaper one with a restore', async () => {
    const up = await lesson(stella, ingo, '2030-01-09T09:00:00.000Z');
    const down = await lesson(stella, ingo, '2030-01-09T13:00:00.000Z');
    const before = await balance(stella);

    const res = await move(office.headers, up, { lessonTypeId: long });
    expect(res.status).toBe(StatusCodes.OK);
    expect(await balance(stella)).toBe(before - 30);
    expect(await entriesFor(up)).toEqual([{ entryType: 'debit', minutes: -30 }]);
    const resized = await row(up);
    expect(resized.creditMinutes).toBe(90);
    expect(resized.period.end.toISOString()).toBe('2030-01-09T10:30:00.000Z');
    const event = await expectEventAppended(db, { type: LessonMoved, aggregateId: up });
    expect(event.payload).toMatchObject({ creditMinutes: 90, creditMinutesDelta: 30 });

    expect((await move(office.headers, down, { lessonTypeId: short })).status).toBe(StatusCodes.OK);
    expect(await balance(stella)).toBe(before - 30 + 15);
    expect(await entriesFor(down)).toEqual([{ entryType: 'restore', minutes: 15 }]);
  });

  it('refuses a type change that changes the required entitlement', async () => {
    const id = await lesson(stella, ingo, '2030-01-09T15:00:00.000Z');
    const res = await move(office.headers, id, { lessonTypeId: examType });
    expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    expect(res.body.error.code).toBe('validation_error');
    expect((await row(id)).version).toBe(1);
  });

  it('charges nothing extra when a student moves outside the cancellation window', async () => {
    const id = await lesson(stella, ingo, '2030-01-10T09:00:00.000Z');
    const before = await balance(stella);
    const res = await move(stellaLogin.headers, id, { start: '2030-01-10T10:00:00.000Z' });
    expect(res.status).toBe(StatusCodes.OK);
    expect(await balance(stella)).toBe(before);
    const event = await expectEventAppended(db, { type: LessonMoved, aggregateId: id });
    expect(event.payload).toMatchObject({ creditMinutesDelta: 0, lateCancellation: false });
  });

  it('charges the full credit again when a student moves inside the window', async () => {
    const id = await lesson(stella, ingo, soon(2));
    const before = await balance(stella);
    const res = await move(stellaLogin.headers, id, { start: '2030-01-10T13:00:00.000Z' });
    expect(res.status).toBe(StatusCodes.OK);
    expect(await balance(stella)).toBe(before - 60);
    expect(await entriesFor(id)).toEqual([{ entryType: 'debit', minutes: -60 }]);
    const event = await expectEventAppended(db, { type: LessonMoved, aggregateId: id });
    expect(event.payload).toMatchObject({ creditMinutesDelta: 60, lateCancellation: true });
  });

  it('refuses a late student move without enough balance and changes nothing', async () => {
    const id = await lesson(sora, ina, soon(3));
    const res = await move(soraLogin.headers, id, { start: '2030-01-10T13:00:00.000Z' });
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('insufficient_balance');
    expect(await balance(sora)).toBe(30);
    expect((await row(id)).version).toBe(1);
  });

  it('lets an instructor move within the own diary but not hand the lesson over', async () => {
    const id = await lesson(stella, ingo, '2030-01-11T09:00:00.000Z');
    const res = await move(ingo.headers, id, { start: '2030-01-11T11:00:00.000Z' });
    expect(res.status).toBe(StatusCodes.OK);
    const handOver = await move(ingo.headers, id, { instructorMembershipId: ina.membershipId });
    expect(handOver.status).toBe(StatusCodes.FORBIDDEN);
    expect((await row(id)).instructorMembershipId).toBe(ingo.membershipId);
  });

  it('returns 409 version_conflict with the server version for a stale version', async () => {
    const id = await lesson(sam, ingo, '2030-01-11T13:00:00.000Z');
    const res = await move(office.headers, id, {
      start: '2030-01-11T14:00:00.000Z',
      version: 3,
    });
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('version_conflict');
    expect(res.body.error.details.serverVersion).toMatchObject({ id, version: 1 });
  });

  it('returns 409 slot_unavailable for a start outside availability', async () => {
    const id = await lesson(sam, ingo, '2030-01-14T09:00:00.000Z');
    const res = await move(office.headers, id, { start: '2030-01-12T10:00:00.000Z' });
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error).toMatchObject({
      code: 'slot_unavailable',
      details: { reason: 'outside_availability' },
    });
  });

  it('returns 409 lesson_not_booked for a cancelled lesson', async () => {
    const id = await insertLesson(tenants, A, {
      studentId: sam,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: '2030-01-14T13:00:00.000Z',
      status: 'cancelled',
    });
    const res = await move(office.headers, id, { start: '2030-01-14T14:00:00.000Z' });
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('lesson_not_booked');
  });
});
