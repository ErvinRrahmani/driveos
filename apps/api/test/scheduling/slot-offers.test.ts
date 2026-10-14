import { randomUUID } from 'node:crypto';
import {
  LessonBooked,
  type LessonResponse,
  SlotOfferAccepted,
  SlotOfferCreated,
  type SlotOfferListResponse,
  WaitingListJoined,
  type WaitingListResponse,
} from '@driveos/shared';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { lessons, slotOffers, waitingList } from '../../src/modules/scheduling/infra/schema.js';
import { students } from '../../src/modules/training/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended, expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { assignInstructor, createLogin, linkGuardianRow, type Login } from '../training/support.js';
import {
  insertLesson,
  insertLessonType,
  insertSlotOffer,
  insertStudent,
  insertWaitingListEntry,
  insertWeekdayAvailability,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const PICKUP = { pickupAddress: 'Torstr. 1', pickupLat: 52.53, pickupLng: 13.4 };
const sorted = (ids: readonly string[]) => [...ids].sort();

describe('waiting list and slot offers', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let office: Login;
  let ingo: Login;
  let ina: Login;
  let stellaLogin: Login;
  let samLogin: Login;
  let brokeLogin: Login;
  let parent: Login;
  let stella: string;
  let sam: string;
  let anchor: string;
  let poor: string;
  let pankow: string;
  let assignedElsewhere: string;
  let classA: string;
  let broke: string;
  let standard: string;
  let waitType: string;
  let joinType: string;
  let motorbike: string;

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

  async function student(
    name: string,
    minutes: number,
    values: Partial<typeof students.$inferInsert> = {},
    userId: string | null = null,
  ): Promise<string> {
    const id = await insertStudent(tenants, A, name, userId);
    await tenants.asSchool(A, (tx) =>
      tx
        .update(students)
        .set({ area: 'Mitte', ...PICKUP, ...values })
        .where(eq(students.id, id)),
    );
    if (minutes !== 0) await credit(id, minutes);
    return id;
  }

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
    samLogin = await createLogin(tenants, A, ['student']);
    brokeLogin = await createLogin(tenants, A, ['student']);
    parent = await createLogin(tenants, A, ['parent']);
    stella = await student('Stella Student', 1000, {}, stellaLogin.userId);
    sam = await student('Sam Schulz', 1000, {}, samLogin.userId);
    anchor = await student('Anton Anchor', 1000);
    poor = await student('Paula Poor', 30);
    pankow = await student('Peter Pankow', 1000, { area: 'Pankow' });
    assignedElsewhere = await student('Erik Elsewhere', 1000);
    classA = await student('Anna Motorbike', 1000, { licenceClass: 'A' });
    broke = await student('Bruno Broke', 60, {}, brokeLogin.userId);
    await assignInstructor(tenants, A, assignedElsewhere, ina.membershipId);
    await linkGuardianRow(tenants, A, sam, parent.userId, new Date());
    standard = await insertLessonType(tenants, A, { name: 'Standard lesson' });
    waitType = await insertLessonType(tenants, A, { name: 'Waiting lesson' });
    joinType = await insertLessonType(tenants, A, { name: 'Join lesson' });
    motorbike = await insertLessonType(tenants, A, { name: 'Motorbike', licenceClass: 'A' });
    await insertWeekdayAvailability(tenants, A, ingo.membershipId);
    await insertWeekdayAvailability(tenants, A, ina.membershipId);
  });

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const createOffer = (body: Record<string, unknown>, headers = office.headers) =>
    http.post('/v1/slot-offers').set(headers).send(body);

  const accept = (offerId: string, headers: Record<string, string>, body = {}, key?: string) =>
    http
      .post(`/v1/slot-offers/${offerId}/accept`)
      .set(headers)
      .set('Idempotency-Key', key ?? randomUUID())
      .send(body);

  async function offerRow(id: string) {
    const [row] = await tenants.asSchool(A, (tx) =>
      tx.select().from(slotOffers).where(eq(slotOffers.id, id)),
    );
    return row;
  }

  async function anchorLesson(start: string): Promise<void> {
    await insertLesson(tenants, A, {
      studentId: anchor,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start,
    });
  }

  async function offerTo(studentIds: string[], start: string): Promise<string> {
    const res = await createOffer({
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start,
      studentIds,
    });
    expect(res.status).toBe(StatusCodes.CREATED);
    return (res.body as { id: string }).id;
  }

  describe('waiting list', () => {
    const windows = [{ weekday: 2, start: '08:00', end: '12:00' }];

    it('lets a student join for themself, emits WaitingListJoined and lists the entry', async () => {
      const res = await http.post('/v1/waiting-list').set(stellaLogin.headers).send({
        studentId: stella,
        lessonTypeId: joinType,
        preferredWindows: windows,
        area: 'Mitte',
      });
      expect(res.status).toBe(StatusCodes.CREATED);
      const { id } = res.body as { id: string };
      expect(res.body).toEqual({ id, version: 1 });
      const event = await expectEventAppended(
        db,
        { type: WaitingListJoined, aggregateId: id },
        { count: 1 },
      );
      expect(event).toMatchObject({
        aggregateType: 'waiting_list',
        aggregateVersion: 1,
        payload: {
          waitingListEntryId: id,
          studentId: stella,
          lessonTypeId: joinType,
          area: 'Mitte',
        },
      });

      const own = await http.get('/v1/waiting-list').set(stellaLogin.headers);
      expect(own.status).toBe(StatusCodes.OK);
      expect((own.body as WaitingListResponse).items).toEqual([
        {
          id,
          studentId: stella,
          studentName: 'Stella Student',
          lessonTypeId: joinType,
          preferredWindows: windows,
          area: 'Mitte',
          active: true,
          createdAt: expect.any(String) as string,
        },
      ]);
      const forOffice = await http
        .get('/v1/waiting-list')
        .query({ lessonTypeId: joinType })
        .set(office.headers);
      expect((forOffice.body as WaitingListResponse).items.map((item) => item.id)).toContain(id);

      const again = await http.post('/v1/waiting-list').set(stellaLogin.headers).send({
        studentId: stella,
        lessonTypeId: joinType,
        preferredWindows: windows,
        area: 'Mitte',
      });
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(again.body).toMatchObject({ error: { code: 'already_on_waiting_list' } });
    });

    it('lets a parent manage linked students only, and a student only themself', async () => {
      const forSam = await http
        .post('/v1/waiting-list')
        .set(parent.headers)
        .send({ studentId: sam, lessonTypeId: joinType, preferredWindows: windows, area: 'Mitte' });
      expect(forSam.status).toBe(StatusCodes.CREATED);

      const parentForOther = await http.post('/v1/waiting-list').set(parent.headers).send({
        studentId: anchor,
        lessonTypeId: joinType,
        preferredWindows: windows,
        area: 'Mitte',
      });
      expect(parentForOther.status).toBe(StatusCodes.FORBIDDEN);
      const studentForOther = await http
        .post('/v1/waiting-list')
        .set(stellaLogin.headers)
        .send({ studentId: sam, lessonTypeId: joinType, preferredWindows: windows, area: 'Mitte' });
      expect(studentForOther.status).toBe(StatusCodes.FORBIDDEN);

      const parentList = await http.get('/v1/waiting-list').set(parent.headers);
      expect((parentList.body as WaitingListResponse).items.map((item) => item.studentId)).toEqual([
        sam,
      ]);
      const samId = (forSam.body as { id: string }).id;
      const notOwn = await http.delete(`/v1/waiting-list/${samId}`).set(stellaLogin.headers);
      expect(notOwn.status).toBe(StatusCodes.NOT_FOUND);

      const left = await http.delete(`/v1/waiting-list/${samId}`).set(parent.headers);
      expect(left.status).toBe(StatusCodes.NO_CONTENT);
      const [row] = await tenants.asSchool(A, (tx) =>
        tx.select().from(waitingList).where(eq(waitingList.id, samId)),
      );
      expect(row?.active).toBe(false);
      const active = await http
        .get('/v1/waiting-list')
        .query({ active: 'true' })
        .set(parent.headers);
      expect((active.body as WaitingListResponse).items).toEqual([]);
    });

    it('rejects a lesson type of another licence class', async () => {
      const res = await http.post('/v1/waiting-list').set(office.headers).send({
        studentId: anchor,
        lessonTypeId: motorbike,
        preferredWindows: windows,
        area: 'Mitte',
      });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body).toMatchObject({ error: { code: 'validation_error' } });
    });
  });

  describe('manual offers', () => {
    it('offers waiting-list students before area matches, first come first served', async () => {
      const slotWindow = [{ weekday: 2, start: '11:00', end: '14:00' }];
      await insertWaitingListEntry(tenants, A, {
        studentId: sam,
        lessonTypeId: waitType,
        preferredWindows: slotWindow,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });
      await insertWaitingListEntry(tenants, A, {
        studentId: stella,
        lessonTypeId: waitType,
        preferredWindows: slotWindow,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await insertWaitingListEntry(tenants, A, {
        studentId: anchor,
        lessonTypeId: waitType,
        preferredWindows: [{ weekday: 3, start: '11:00', end: '14:00' }],
      });
      await anchorLesson('2030-01-08T08:00:00.000Z');

      const res = await createOffer({
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: waitType,
        start: '2030-01-08T11:00:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.CREATED);
      const { id } = res.body as { id: string };
      expect(res.body).toEqual({ id, version: 1 });
      const row = await offerRow(id);
      expect(row).toMatchObject({
        source: 'manual',
        status: 'open',
        offeredToStudentIds: [stella, sam],
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: waitType,
      });
      const event = await expectEventAppended(
        db,
        { type: SlotOfferCreated, aggregateId: id },
        { count: 1 },
      );
      expect(event).toMatchObject({
        aggregateType: 'slot_offer',
        aggregateVersion: 1,
        payload: {
          offerId: id,
          source: 'manual',
          offeredToStudentIds: [stella, sam],
          creditMinutes: 60,
          start: '2030-01-08T11:00:00.000Z',
          end: '2030-01-08T12:00:00.000Z',
          expiresAt: row?.expiresAt.toISOString(),
        },
      });
      const ttl = (row?.expiresAt.getTime() ?? 0) - Date.now();
      expect(ttl).toBeGreaterThan(110 * 60_000);
      expect(ttl).toBeLessThanOrEqual(120 * 60_000);
    });

    it('falls back to area matches with enough credit, licence class and allowed instructor', async () => {
      await anchorLesson('2030-01-09T08:00:00.000Z');
      const res = await createOffer({
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-09T11:00:00.000Z',
      });
      expect(res.status).toBe(StatusCodes.CREATED);
      const row = await offerRow((res.body as { id: string }).id);
      expect(sorted(row?.offeredToStudentIds ?? [])).toEqual(sorted([stella, sam, anchor, broke]));
      expect(row?.offeredToStudentIds).not.toContain(poor);
      expect(row?.offeredToStudentIds).not.toContain(pankow);
      expect(row?.offeredToStudentIds).not.toContain(assignedElsewhere);
      expect(row?.offeredToStudentIds).not.toContain(classA);
    });

    it('restricts the audience to explicit students that pass the same filters', async () => {
      const res = await createOffer({
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-10T11:00:00.000Z',
        studentIds: [pankow, poor, assignedElsewhere, classA],
      });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect((await offerRow((res.body as { id: string }).id))?.offeredToStudentIds).toEqual([
        pankow,
      ]);
    });

    it('returns 409 no_eligible_students when nobody matches', async () => {
      const res = await createOffer({
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-10T13:00:00.000Z',
        studentIds: [poor],
      });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body).toMatchObject({ error: { code: 'no_eligible_students' } });
    });

    it('returns 409 lesson_conflict for a slot that is already booked', async () => {
      await anchorLesson('2030-01-11T08:00:00.000Z');
      const res = await createOffer({
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-11T08:30:00.000Z',
        studentIds: [stella],
      });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body).toMatchObject({ error: { code: 'lesson_conflict' } });
    });

    it('is staff only', async () => {
      const res = await createOffer(
        {
          instructorMembershipId: ingo.membershipId,
          lessonTypeId: standard,
          start: '2030-01-11T13:00:00.000Z',
          studentIds: [stella],
        },
        stellaLogin.headers,
      );
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('accept', () => {
    it('two students accepting at once -> exactly one lesson', async () => {
      const offerId = await offerTo([stella, sam], '2030-01-14T11:00:00.000Z');
      const results = await Promise.all([
        accept(offerId, stellaLogin.headers),
        accept(offerId, samLogin.headers),
      ]);
      expect(sorted(results.map((res) => String(res.status)))).toEqual(
        sorted([String(StatusCodes.CREATED), String(StatusCodes.CONFLICT)]),
      );
      const winner = results.find((res) => res.status === StatusCodes.CREATED);
      const loser = results.find((res) => res.status === StatusCodes.CONFLICT);
      expect(loser?.body).toMatchObject({ error: { code: 'offer_unavailable' } });
      const lesson = winner?.body as LessonResponse;
      expect(lesson).toMatchObject({
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-14T11:00:00.000Z',
        status: 'booked',
        bookedVia: 'slot_offer',
      });

      const booked = await tenants.asSchool(A, (tx) =>
        tx
          .select()
          .from(lessons)
          .where(
            and(
              eq(lessons.instructorMembershipId, ingo.membershipId),
              sql`lower(${lessons.period}) = '2030-01-14T11:00:00Z'::timestamptz`,
            ),
          ),
      );
      expect(booked).toHaveLength(1);
      expect(booked[0]).toMatchObject({ id: lesson.id, bookedVia: 'slot_offer' });
      expect(await offerRow(offerId)).toMatchObject({
        status: 'taken',
        lessonId: lesson.id,
        acceptedByStudentId: lesson.studentId,
      });
      const accepted = await expectEventAppended(
        db,
        { type: SlotOfferAccepted, aggregateId: offerId },
        { count: 1 },
      );
      expect(accepted).toMatchObject({
        aggregateVersion: 2,
        payload: { offerId, lessonId: lesson.id, studentId: lesson.studentId, source: 'manual' },
      });
      await expectEventAppended(db, { type: LessonBooked, aggregateId: lesson.id }, { count: 1 });
    });

    it('rejects an expired offer with 409 offer_unavailable', async () => {
      const offerId = await insertSlotOffer(tenants, A, {
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-15T11:00:00.000Z',
        offeredToStudentIds: [stella],
        expiresAt: new Date(Date.now() - 60_000),
      });
      const res = await accept(offerId, stellaLogin.headers);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body).toMatchObject({ error: { code: 'offer_unavailable' } });
      expect((await offerRow(offerId))?.status).toBe('open');
    });

    it('rejects a student who is not in the audience with 409', async () => {
      const offerId = await offerTo([sam], '2030-01-15T13:00:00.000Z');
      const res = await accept(offerId, stellaLogin.headers);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body).toMatchObject({ error: { code: 'offer_unavailable' } });
    });

    it('rolls the offer back to open when the booking fails for lack of credit', async () => {
      const offerId = await offerTo([broke], '2030-01-16T11:00:00.000Z');
      await credit(broke, -30);
      const res = await accept(offerId, brokeLogin.headers);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body).toMatchObject({ error: { code: 'insufficient_balance' } });
      expect(await offerRow(offerId)).toMatchObject({
        status: 'open',
        acceptedByStudentId: null,
        lessonId: null,
      });
      const own = await tenants.asSchool(A, (tx) =>
        tx.select().from(lessons).where(eq(lessons.studentId, broke)),
      );
      expect(own).toEqual([]);
      expect(await expectEvents(db, { type: SlotOfferAccepted, aggregateId: offerId })).toEqual([]);
    });

    it('lets a parent accept for the linked student and replays an idempotent retry', async () => {
      const offerId = await offerTo([sam], '2030-01-16T13:00:00.000Z');
      const key = randomUUID();
      const res = await accept(offerId, parent.headers, {}, key);
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({
        studentId: sam,
        bookedVia: 'slot_offer',
        bookedByMembershipId: parent.membershipId,
      });
      const replay = await accept(offerId, parent.headers, {}, key);
      expect(replay.status).toBe(StatusCodes.CREATED);
      expect(replay.body).toEqual(res.body);
      await expectEventAppended(
        db,
        { type: SlotOfferAccepted, aggregateId: offerId },
        { count: 1 },
      );
    });
  });

  describe('GET /v1/slot-offers', () => {
    it('shows students and parents open offers made to them; staff see every offer', async () => {
      const forStella = await offerTo([stella], '2030-01-17T11:00:00.000Z');
      const forSam = await offerTo([sam], '2030-01-17T13:00:00.000Z');
      const expiredForStella = await insertSlotOffer(tenants, A, {
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        start: '2030-01-18T11:00:00.000Z',
        offeredToStudentIds: [stella],
        expiresAt: new Date(Date.now() - 60_000),
      });

      const ids = (body: unknown) => (body as SlotOfferListResponse).items.map((item) => item.id);
      const own = await http.get('/v1/slot-offers').set(stellaLogin.headers);
      expect(own.status).toBe(StatusCodes.OK);
      expect(ids(own.body)).toContain(forStella);
      expect(ids(own.body)).not.toContain(forSam);
      expect(ids(own.body)).not.toContain(expiredForStella);
      expect(
        (own.body as SlotOfferListResponse).items.every((item) => item.status === 'open'),
      ).toBe(true);
      expect(
        (own.body as SlotOfferListResponse).items.find((item) => item.id === forStella),
      ).toMatchObject({
        instructorMembershipId: ingo.membershipId,
        lessonTypeId: standard,
        lessonTypeName: 'Standard lesson',
        creditMinutes: 60,
        start: '2030-01-17T11:00:00.000Z',
        end: '2030-01-17T12:00:00.000Z',
        source: 'manual',
        status: 'open',
        vehicleId: null,
      });

      const forParent = await http.get('/v1/slot-offers').set(parent.headers);
      expect(ids(forParent.body)).toContain(forSam);
      expect(ids(forParent.body)).not.toContain(forStella);

      const staff = await http.get('/v1/slot-offers').set(office.headers);
      expect(ids(staff.body)).toEqual(
        expect.arrayContaining([forStella, forSam, expiredForStella]),
      );
      const taken = await http
        .get('/v1/slot-offers')
        .query({ status: 'taken' })
        .set(office.headers);
      expect((taken.body as SlotOfferListResponse).items.length).toBeGreaterThan(0);
      expect(
        (taken.body as SlotOfferListResponse).items.every((item) => item.status === 'taken'),
      ).toBe(true);

      const page = await http.get('/v1/slot-offers').query({ limit: 1 }).set(office.headers);
      const next = (page.body as SlotOfferListResponse).nextCursor;
      expect(next).toEqual(expect.any(String));
      const second = await http
        .get('/v1/slot-offers')
        .query({ limit: 1, cursor: next })
        .set(office.headers);
      expect(ids(second.body)).not.toEqual(ids(page.body));
    });

    it('is not visible to an instructor without slot offer permissions', async () => {
      const res = await http.get('/v1/slot-offers').set(ingo.headers);
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });
});
