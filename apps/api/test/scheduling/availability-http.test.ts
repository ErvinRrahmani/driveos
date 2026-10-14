import { AvailabilityChanged, TimeOffAdded } from '@driveos/shared';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { availability, timeOff } from '../../src/modules/scheduling/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended, expectNoEvent } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createLogin, type Login } from '../training/support.js';
import { StatusCodes } from 'http-status-codes';

const weekdays = (startTime: string, endTime: string) =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime, endTime }));

describe('availability and time off', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let ingo: Login;
  let ina: Login;
  let office: Login;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    office = await createLogin(tenants, A, ['office']);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const rowsOf = (membershipId: string) =>
    tenants.asSchool(A, (tx) =>
      tx
        .select()
        .from(availability)
        .where(eq(availability.instructorMembershipId, membershipId))
        .orderBy(asc(availability.validFrom), asc(availability.weekday)),
    );

  describe('PUT /v1/instructors/:id/availability', () => {
    it('replaces the pattern: closes the old rows the day before and emits AvailabilityChanged', async () => {
      const first = await http
        .put(`/v1/instructors/${ingo.membershipId}/availability`)
        .set(office.headers)
        .send({ effectiveFrom: '2026-09-01', windows: weekdays('09:00', '17:00') })
        .expect(StatusCodes.OK);
      expect(first.body.instructorMembershipId).toBe(ingo.membershipId);
      expect(first.body.items).toHaveLength(5);
      const v1 = await expectEventAppended(db, {
        type: AvailabilityChanged,
        aggregateId: ingo.membershipId,
      });
      expect(v1.aggregateVersion).toBe(1);

      const second = await http
        .put(`/v1/instructors/${ingo.membershipId}/availability`)
        .set(office.headers)
        .send({
          effectiveFrom: '2026-11-02',
          windows: [{ weekday: 2, startTime: '12:00', endTime: '20:00' }],
        })
        .expect(StatusCodes.OK);
      const rows = await rowsOf(ingo.membershipId);
      expect(rows.filter((row) => row.validFrom === '2026-09-01')).toHaveLength(5);
      expect(
        rows
          .filter((row) => row.validFrom === '2026-09-01')
          .every((r) => r.validTo === '2026-11-01'),
      ).toBe(true);
      expect(rows.filter((row) => row.validFrom === '2026-11-02')).toMatchObject([
        { weekday: 2, startTime: '12:00:00', endTime: '20:00:00', validTo: null, version: 2 },
      ]);
      expect(second.body.items).toContainEqual({
        id: expect.any(String),
        weekday: 2,
        startTime: '12:00',
        endTime: '20:00',
        validFrom: '2026-11-02',
        validTo: null,
      });
      const v2 = await expectEventAppended(db, {
        type: AvailabilityChanged,
        aggregateId: ingo.membershipId,
      });
      expect(v2.aggregateVersion).toBe(2);
      expect(v2.payload).toEqual({
        instructorMembershipId: ingo.membershipId,
        effectiveFrom: '2026-11-02',
        windows: [{ weekday: 2, startTime: '12:00', endTime: '20:00' }],
      });
    });

    it('with effectiveTo, the previous pattern resumes the day after', async () => {
      await http
        .put(`/v1/instructors/${ina.membershipId}/availability`)
        .set(office.headers)
        .send({ effectiveFrom: '2026-09-01', windows: weekdays('09:00', '17:00') })
        .expect(StatusCodes.OK);
      await http
        .put(`/v1/instructors/${ina.membershipId}/availability`)
        .set(office.headers)
        .send({
          effectiveFrom: '2026-12-21',
          effectiveTo: '2027-01-03',
          windows: [{ weekday: 1, startTime: '10:00', endTime: '12:00' }],
        })
        .expect(StatusCodes.OK);
      const rows = await rowsOf(ina.membershipId);
      expect(
        rows.map((row) => [row.weekday, row.validFrom, row.validTo]).filter(([wd]) => wd === 1),
      ).toEqual([
        [1, '2026-09-01', '2026-12-20'],
        [1, '2026-12-21', '2027-01-03'],
        [1, '2027-01-04', null],
      ]);
      const event = await expectEventAppended(db, {
        type: AvailabilityChanged,
        aggregateId: ina.membershipId,
      });
      expect(event.payload.effectiveTo).toBe('2027-01-03');
    });

    it('rejects overlapping windows on the same weekday and changes nothing', async () => {
      const before = await rowsOf(ingo.membershipId);
      const res = await http
        .put(`/v1/instructors/${ingo.membershipId}/availability`)
        .set(office.headers)
        .send({
          effectiveFrom: '2026-12-01',
          windows: [
            { weekday: 1, startTime: '09:00', endTime: '12:00' },
            { weekday: 1, startTime: '11:00', endTime: '13:00' },
          ],
        })
        .expect(StatusCodes.BAD_REQUEST);
      expect(res.body.error.details.issues[0].path).toEqual(['windows', 1]);
      expect(await rowsOf(ingo.membershipId)).toEqual(before);
    });

    it('lets an instructor replace their own availability', async () => {
      await http
        .put(`/v1/instructors/${ingo.membershipId}/availability`)
        .set(ingo.headers)
        .send({ effectiveFrom: '2026-11-02', windows: weekdays('08:00', '16:00') })
        .expect(StatusCodes.OK);
    });

    it("forbids an instructor to replace another instructor's availability", async () => {
      await http
        .put(`/v1/instructors/${ina.membershipId}/availability`)
        .set(ingo.headers)
        .send({ effectiveFrom: '2026-11-02', windows: weekdays('08:00', '16:00') })
        .expect(StatusCodes.FORBIDDEN);
    });

    it('answers 404 for a membership that is not an instructor of this school', async () => {
      await http
        .put(`/v1/instructors/${office.membershipId}/availability`)
        .set(authHeaders(A))
        .send({ effectiveFrom: '2026-11-02', windows: [] })
        .expect(StatusCodes.NOT_FOUND);
      await http
        .put(`/v1/instructors/${ingo.membershipId}/availability`)
        .set(authHeaders(B))
        .send({ effectiveFrom: '2026-11-02', windows: [] })
        .expect(StatusCodes.NOT_FOUND);
    });
  });

  describe('GET /v1/instructors/:id/availability', () => {
    it('returns the current and future patterns with validity and upcoming time off', async () => {
      const res = await http
        .get(`/v1/instructors/${ingo.membershipId}/availability`)
        .set(office.headers)
        .expect(StatusCodes.OK);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items[0]).toEqual({
        id: expect.any(String),
        weekday: expect.any(Number),
        startTime: expect.stringMatching(/^\d\d:\d\d$/),
        endTime: expect.stringMatching(/^\d\d:\d\d$/),
        validFrom: expect.any(String),
        validTo: res.body.items[0].validTo,
      });
      const today = new Date().toISOString().slice(0, 10);
      expect(
        res.body.items.every(
          (item: { validTo: string | null }) => item.validTo === null || item.validTo >= today,
        ),
      ).toBe(true);
      expect(res.body.timeOff).toEqual(expect.any(Array));
    });

    it('lets an instructor read only their own availability', async () => {
      await http
        .get(`/v1/instructors/${ingo.membershipId}/availability`)
        .set(ingo.headers)
        .expect(StatusCodes.OK);
      await http
        .get(`/v1/instructors/${ina.membershipId}/availability`)
        .set(ingo.headers)
        .expect(StatusCodes.FORBIDDEN);
    });
  });

  describe('POST /v1/instructors/:id/time-off', () => {
    const future = (days: number, hour = 0) => {
      const date = new Date(Date.UTC(2030, 0, 1 + days, hour));
      return date.toISOString();
    };

    it('records time off as a half-open period and emits TimeOffAdded', async () => {
      const res = await http
        .post(`/v1/instructors/${ingo.membershipId}/time-off`)
        .set(ingo.headers)
        .send({ start: future(0), end: future(2), reason: 'Holiday' })
        .expect(StatusCodes.CREATED);
      expect(res.body).toEqual({ id: expect.any(String), version: 1 });
      const [row] = await tenants.asSchool(A, (tx) =>
        tx.select().from(timeOff).where(eq(timeOff.id, res.body.id)),
      );
      expect(row?.period).toEqual({ start: new Date(future(0)), end: new Date(future(2)) });
      const event = await expectEventAppended(db, { type: TimeOffAdded, aggregateId: res.body.id });
      expect(event.payload).toEqual({
        timeOffId: res.body.id,
        instructorMembershipId: ingo.membershipId,
        start: future(0),
        end: future(2),
      });
      const listed = await http
        .get(`/v1/instructors/${ingo.membershipId}/availability`)
        .set(ingo.headers)
        .expect(StatusCodes.OK);
      expect(listed.body.timeOff).toContainEqual({
        id: res.body.id,
        start: future(0),
        end: future(2),
        reason: 'Holiday',
      });
    });

    it('answers 409 time_off_overlap for an overlapping time off and allows a touching one', async () => {
      const res = await http
        .post(`/v1/instructors/${ingo.membershipId}/time-off`)
        .set(office.headers)
        .send({ start: future(1), end: future(3), reason: 'Course' })
        .expect(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('time_off_overlap');
      await expectNoEvent(db, {
        type: TimeOffAdded,
        aggregateType: 'time_off',
        schoolId: B.schoolId,
      });
      await http
        .post(`/v1/instructors/${ingo.membershipId}/time-off`)
        .set(office.headers)
        .send({ start: future(2), end: future(3) })
        .expect(StatusCodes.CREATED);
    });

    it('forbids an instructor to add time off for another instructor', async () => {
      await http
        .post(`/v1/instructors/${ina.membershipId}/time-off`)
        .set(ingo.headers)
        .send({ start: future(10), end: future(11) })
        .expect(StatusCodes.FORBIDDEN);
    });
  });
});
