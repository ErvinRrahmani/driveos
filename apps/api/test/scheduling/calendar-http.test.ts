import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { timeOff } from '../../src/modules/scheduling/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
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

const MONDAY = '2030-01-07T00:00:00.000Z';
const NEXT_MONDAY = '2030-01-14T00:00:00.000Z';

describe('calendar and free slots', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let ingo: Login;
  let ina: Login;
  let office: Login;
  let stellaLogin: Login;
  let parent: Login;
  let stella: string;
  let sam: string;
  let car: string;
  let standard: string;
  let withCar: string;
  const lesson: Record<string, string> = {};

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    office = await createLogin(tenants, A, ['office']);
    stellaLogin = await createLogin(tenants, A, ['student']);
    parent = await createLogin(tenants, A, ['parent']);
    stella = await insertStudent(tenants, A, 'Stella Student', stellaLogin.userId);
    sam = await insertStudent(tenants, A, 'Sam Schulz');
    await linkGuardianRow(tenants, A, sam, parent.userId, new Date());
    await assignInstructor(tenants, A, stella, ingo.membershipId);
    car = await insertVehicle(tenants, A, 'B-DS 101');
    standard = await insertLessonType(tenants, A, { name: 'Standard lesson' });
    withCar = await insertLessonType(tenants, A, { name: 'Car lesson', requiresVehicle: true });
    await insertWeekdayAvailability(tenants, A, ingo.membershipId);
    await insertWeekdayAvailability(tenants, A, ina.membershipId);
    lesson.stellaIngoMon = await insertLesson(tenants, A, {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: withCar,
      vehicleId: car,
      start: '2030-01-07T08:00:00.000Z',
    });
    lesson.samInaMon = await insertLesson(tenants, A, {
      studentId: sam,
      instructorMembershipId: ina.membershipId,
      lessonTypeId: standard,
      start: '2030-01-07T10:00:00.000Z',
    });
    lesson.samIngoTueCancelled = await insertLesson(tenants, A, {
      studentId: sam,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: '2030-01-08T09:00:00.000Z',
      status: 'cancelled',
    });
    lesson.later = await insertLesson(tenants, A, {
      studentId: sam,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: '2030-01-20T09:00:00.000Z',
    });
    await tenants.asSchool(A, (tx) =>
      tx.insert(timeOff).values({
        schoolId: A.schoolId,
        instructorMembershipId: ingo.membershipId,
        period: {
          start: new Date('2030-01-10T23:00:00.000Z'),
          end: new Date('2030-01-11T23:00:00.000Z'),
        },
        reason: 'Dentist',
      }),
    );
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const calendar = (headers: Record<string, string>, query: Record<string, string> = {}) =>
    http
      .get('/v1/calendar')
      .set(headers)
      .query({ from: MONDAY, to: NEXT_MONDAY, ...query });
  const ids = (body: { items: { id: string }[] }) => body.items.map((item) => item.id).sort();

  describe('GET /v1/calendar', () => {
    it('returns every lesson overlapping the range for staff, with names, plate and type', async () => {
      const res = await calendar(office.headers).expect(StatusCodes.OK);
      expect(ids(res.body)).toEqual(
        [lesson.stellaIngoMon, lesson.samInaMon, lesson.samIngoTueCancelled].sort(),
      );
      expect(res.body.items[0]).toMatchObject({
        id: lesson.stellaIngoMon,
        studentId: stella,
        studentName: 'Stella Student',
        instructorMembershipId: ingo.membershipId,
        instructorName: expect.any(String),
        vehicleId: car,
        vehiclePlate: 'B-DS 101',
        lessonTypeId: withCar,
        lessonTypeName: 'Car lesson',
        lessonTypeKind: 'lesson',
        start: '2030-01-07T08:00:00.000Z',
        end: '2030-01-07T09:00:00.000Z',
        status: 'booked',
        pickupAddress: 'Torstr. 1',
        bookedVia: 'office',
        version: 1,
      });
      expect(res.body.items[0].instructorName.length).toBeGreaterThan(0);
      expect(res.body.items.map((item: { start: string }) => item.start)).toEqual(
        [...res.body.items.map((item: { start: string }) => item.start)].sort(),
      );
    });

    it('carries the availability windows (minus time off) and the time off of the range', async () => {
      const res = await calendar(office.headers, { instructorId: ingo.membershipId }).expect(
        StatusCodes.OK,
      );
      expect(res.body.availability).toHaveLength(4);
      expect(res.body.availability[0]).toEqual({
        instructorMembershipId: ingo.membershipId,
        start: '2030-01-07T08:00:00.000Z',
        end: '2030-01-07T16:00:00.000Z',
      });
      expect(res.body.timeOff).toEqual([
        {
          id: expect.any(String),
          instructorMembershipId: ingo.membershipId,
          start: '2030-01-10T23:00:00.000Z',
          end: '2030-01-11T23:00:00.000Z',
        },
      ]);
    });

    it('filters by instructor, vehicle and student', async () => {
      expect(
        ids((await calendar(office.headers, { instructorId: ina.membershipId })).body),
      ).toEqual([lesson.samInaMon]);
      expect(ids((await calendar(office.headers, { vehicleId: car })).body)).toEqual([
        lesson.stellaIngoMon,
      ]);
      expect(ids((await calendar(office.headers, { studentId: sam })).body)).toEqual(
        [lesson.samInaMon, lesson.samIngoTueCancelled].sort(),
      );
    });

    it('shows an instructor only their own lessons', async () => {
      expect(ids((await calendar(ingo.headers).expect(StatusCodes.OK)).body)).toEqual(
        [lesson.stellaIngoMon, lesson.samIngoTueCancelled].sort(),
      );
      const other = await calendar(ingo.headers, { instructorId: ina.membershipId }).expect(
        StatusCodes.OK,
      );
      expect(other.body.items).toEqual([]);
      expect(other.body.availability).toEqual([]);
    });

    it('shows a student only their own lessons and no staff schedule', async () => {
      const res = await calendar(stellaLogin.headers).expect(StatusCodes.OK);
      expect(ids(res.body)).toEqual([lesson.stellaIngoMon]);
      expect(res.body.availability).toEqual([]);
      expect(res.body.timeOff).toEqual([]);
    });

    it('shows a parent the lessons of linked students only', async () => {
      expect(ids((await calendar(parent.headers).expect(StatusCodes.OK)).body)).toEqual(
        [lesson.samInaMon, lesson.samIngoTueCancelled].sort(),
      );
    });

    it('pages through the range by start time', async () => {
      const first = await calendar(office.headers, { limit: '2' }).expect(StatusCodes.OK);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await calendar(office.headers, {
        limit: '2',
        cursor: first.body.nextCursor,
      }).expect(StatusCodes.OK);
      expect(ids(second.body)).toEqual([lesson.samIngoTueCancelled]);
      expect(second.body.nextCursor).toBeNull();
      await calendar(office.headers, { cursor: 'nonsense' }).expect(StatusCodes.BAD_REQUEST);
    });

    it('rejects a range longer than 62 days', async () => {
      await http
        .get('/v1/calendar')
        .set(office.headers)
        .query({ from: MONDAY, to: '2030-03-11T00:00:00.000Z' })
        .expect(StatusCodes.BAD_REQUEST);
    });

    it("never shows another school's lessons", async () => {
      const res = await calendar(authHeaders(B)).expect(StatusCodes.OK);
      expect(res.body.items).toEqual([]);
    });
  });

  describe('GET /v1/calendar/free-slots', () => {
    const TUESDAY = { from: '2030-01-08T00:00:00.000Z', to: '2030-01-09T00:00:00.000Z' };
    const slots = (headers: Record<string, string>, query: Record<string, string>) =>
      http
        .get('/v1/calendar/free-slots')
        .set(headers)
        .query({ ...TUESDAY, ...query });
    const starts = (
      body: { items: { start: string; instructorMembershipId: string }[] },
      who: string,
    ) =>
      body.items
        .filter((slot) => slot.instructorMembershipId === who)
        .map((slot) => slot.start.slice(11, 16));

    beforeAll(async () => {
      lesson.ingoTueBooked = await insertLesson(tenants, A, {
        studentId: stella,
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-08T10:00:00.000Z',
      });
      lesson.inaTueCar = await insertLesson(tenants, A, {
        studentId: sam,
        instructorMembershipId: ina.membershipId,
        lessonTypeId: withCar,
        vehicleId: car,
        start: '2030-01-08T08:00:00.000Z',
      });
    });

    it('lists 15-minute slots inside availability that avoid booked lessons but not cancelled ones', async () => {
      const res = await slots(office.headers, {
        lessonTypeId: standard,
        instructorId: ingo.membershipId,
      }).expect(StatusCodes.OK);
      const ingoStarts = starts(res.body, ingo.membershipId);
      expect(ingoStarts.slice(0, 5)).toEqual(['08:00', '08:15', '08:30', '08:45', '09:00']);
      expect(ingoStarts).not.toContain('09:15');
      expect(ingoStarts).not.toContain('10:00');
      expect(ingoStarts).toContain('11:00');
      expect(ingoStarts.at(-1)).toBe('15:00');
      expect(res.body.items[0]).toEqual({
        start: '2030-01-08T08:00:00.000Z',
        end: '2030-01-08T09:00:00.000Z',
        instructorMembershipId: ingo.membershipId,
        instructorName: expect.any(String),
        vehicleId: null,
      });
    });

    it('respects min_gap_minutes from the school settings', async () => {
      await http
        .patch('/v1/school/settings')
        .set(authHeaders(A))
        .send({ minGapMinutes: 15 })
        .expect(StatusCodes.OK);
      const res = await slots(office.headers, {
        lessonTypeId: standard,
        instructorId: ingo.membershipId,
      }).expect(StatusCodes.OK);
      const ingoStarts = starts(res.body, ingo.membershipId);
      expect(ingoStarts).toContain('08:45');
      expect(ingoStarts).not.toContain('09:00');
      expect(ingoStarts).not.toContain('11:00');
      expect(ingoStarts).toContain('11:15');
      await http
        .patch('/v1/school/settings')
        .set(authHeaders(A))
        .send({ minGapMinutes: 0 })
        .expect(StatusCodes.OK);
    });

    it('pairs a vehicle when the type requires one and skips times when none is free', async () => {
      const res = await slots(office.headers, {
        lessonTypeId: withCar,
        instructorId: ingo.membershipId,
      }).expect(StatusCodes.OK);
      const ingoStarts = starts(res.body, ingo.membershipId);
      expect(ingoStarts).not.toContain('08:00');
      expect(ingoStarts[0]).toBe('09:00');
      expect(res.body.items.every((slot: { vehicleId: string }) => slot.vehicleId === car)).toBe(
        true,
      );
    });

    it('a student only sees slots of their assigned instructors', async () => {
      const res = await slots(stellaLogin.headers, { lessonTypeId: standard }).expect(
        StatusCodes.OK,
      );
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(
        res.body.items.every(
          (slot: { instructorMembershipId: string }) =>
            slot.instructorMembershipId === ingo.membershipId,
        ),
      ).toBe(true);
    });

    it('a parent of an unassigned student sees every active instructor', async () => {
      const res = await slots(parent.headers, { lessonTypeId: standard }).expect(StatusCodes.OK);
      const who = new Set(
        res.body.items.map(
          (slot: { instructorMembershipId: string }) => slot.instructorMembershipId,
        ),
      );
      expect(who).toEqual(new Set([ingo.membershipId, ina.membershipId]));
    });

    it('an instructor only sees their own slots', async () => {
      const res = await slots(ina.headers, { lessonTypeId: standard }).expect(StatusCodes.OK);
      expect(
        new Set(
          res.body.items.map(
            (slot: { instructorMembershipId: string }) => slot.instructorMembershipId,
          ),
        ),
      ).toEqual(new Set([ina.membershipId]));
    });

    it('subtracts time off', async () => {
      const res = await slots(office.headers, {
        lessonTypeId: standard,
        instructorId: ingo.membershipId,
        from: '2030-01-11T00:00:00.000Z',
        to: '2030-01-12T00:00:00.000Z',
      }).expect(StatusCodes.OK);
      expect(res.body.items).toEqual([]);
    });

    it('rejects a range longer than 14 days and an unknown lesson type', async () => {
      await slots(office.headers, {
        lessonTypeId: standard,
        to: '2030-01-23T00:00:00.000Z',
      }).expect(StatusCodes.BAD_REQUEST);
      await slots(office.headers, { lessonTypeId: crypto.randomUUID() }).expect(
        StatusCodes.NOT_FOUND,
      );
      await slots(authHeaders(B), { lessonTypeId: standard }).expect(StatusCodes.NOT_FOUND);
    });
  });
});
