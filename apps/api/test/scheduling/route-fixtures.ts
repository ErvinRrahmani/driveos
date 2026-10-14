import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { changeFeed } from '../../src/modules/scheduling/infra/schema.js';
import { createStudent, createUser } from '../identity/support.js';
import {
  expectListResponse,
  type FixtureContext,
  type RouteFixtures,
} from '../support/cross-tenant.js';
import {
  insertLesson,
  insertLessonType,
  insertSlotOffer,
  insertVehicle,
  insertWaitingListEntry,
  insertWeekdayAvailability,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

async function instructorOfA(ctx: FixtureContext): Promise<string> {
  const user = await createUser(ctx.tenants, {
    memberships: [{ tenant: ctx.A, roles: ['instructor'] }],
  });
  const membershipId = user.membershipIds[0] as string;
  await insertWeekdayAvailability(ctx.tenants, ctx.A, membershipId);
  return membershipId;
}

const instructorParams = async (ctx: FixtureContext) => ({
  params: { id: await instructorOfA(ctx) },
});

async function startedLessonOfA(ctx: FixtureContext) {
  const instructor = await instructorOfA(ctx);
  const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
  const lessonTypeId = await insertLessonType(ctx.tenants, ctx.A);
  const lessonId = await insertLesson(ctx.tenants, ctx.A, {
    studentId,
    instructorMembershipId: instructor,
    lessonTypeId,
    start: new Date(Date.now() - 3_600_000).toISOString(),
  });
  return { params: { id: lessonId }, aIds: [instructor, studentId, lessonTypeId, lessonId] };
}

async function waitingEntryOfA(ctx: FixtureContext) {
  const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
  const lessonTypeId = await insertLessonType(ctx.tenants, ctx.A);
  const entryId = await insertWaitingListEntry(ctx.tenants, ctx.A, { studentId, lessonTypeId });
  return { studentId, lessonTypeId, entryId };
}

async function slotOfferOfA(ctx: FixtureContext) {
  const instructor = await instructorOfA(ctx);
  const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
  const lessonTypeId = await insertLessonType(ctx.tenants, ctx.A);
  const offerId = await insertSlotOffer(ctx.tenants, ctx.A, {
    instructorMembershipId: instructor,
    lessonTypeId,
    start: '2030-01-08T09:00:00.000Z',
    offeredToStudentIds: [studentId],
  });
  return { instructor, studentId, lessonTypeId, offerId };
}

async function changeFeedOfA(ctx: FixtureContext) {
  const { params, aIds } = await startedLessonOfA(ctx);
  const vehicleId = await insertVehicle(ctx.tenants, ctx.A, 'B-XT 1');
  await ctx.tenants.asSchool(ctx.A, (tx) =>
    tx.insert(changeFeed).values([
      {
        schoolId: ctx.A.schoolId,
        entity: 'lesson',
        entityId: params.id,
        op: 'upsert',
        audienceMembershipId: ctx.A.ownerMembershipId,
        at: new Date(),
      },
      {
        schoolId: ctx.A.schoolId,
        entity: 'vehicle',
        entityId: vehicleId,
        op: 'upsert',
        audienceMembershipId: null,
        at: new Date(),
      },
    ]),
  );
  return { lessonIds: aIds, vehicleId };
}

const RANGE = { from: '2030-01-07T00:00:00.000Z', to: '2030-01-14T00:00:00.000Z' };

export const schedulingFixtures: RouteFixtures = {
  'GET /v1/lesson-types': {
    setup: async (ctx) => ({ aIds: [await insertLessonType(ctx.tenants, ctx.A)] }),
    expect: expectListResponse('items'),
  },
  'POST /v1/lesson-types': {
    setup: async (ctx) => ({
      body: {
        name: 'Cross tenant',
        kind: 'lesson',
        licenceClass: 'B',
        minutes: 60,
        creditMinutes: 60,
        requiresVehicle: false,
        requiresEntitlement: null,
      },
      aIds: [await insertLessonType(ctx.tenants, ctx.A)],
    }),
    expect: (res) => expect(res.status).toBe(StatusCodes.CREATED),
  },
  'PATCH /v1/lesson-types/:id': {
    setup: async (ctx) => ({
      params: { id: await insertLessonType(ctx.tenants, ctx.A) },
      body: { name: 'Hijacked' },
    }),
  },
  'GET /v1/calendar': {
    setup: async (ctx) => {
      const instructor = await instructorOfA(ctx);
      const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
      const lessonTypeId = await insertLessonType(ctx.tenants, ctx.A);
      const lessonId = await insertLesson(ctx.tenants, ctx.A, {
        studentId,
        instructorMembershipId: instructor,
        lessonTypeId,
        start: '2030-01-08T09:00:00.000Z',
      });
      return { query: RANGE, aIds: [instructor, studentId, lessonTypeId, lessonId] };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ items: [], availability: [], timeOff: [] });
    },
  },
  'GET /v1/calendar/free-slots': {
    setup: async (ctx) => {
      const instructor = await instructorOfA(ctx);
      const lessonTypeId = await insertLessonType(ctx.tenants, ctx.A);
      return {
        query: { ...RANGE, lessonTypeId, instructorId: instructor },
        aIds: [instructor, lessonTypeId],
      };
    },
  },
  'GET /v1/instructors/:id/availability': { setup: instructorParams },
  'PUT /v1/instructors/:id/availability': {
    setup: async (ctx) => ({
      ...(await instructorParams(ctx)),
      body: { effectiveFrom: '2030-01-07', windows: [] },
    }),
  },
  'POST /v1/instructors/:id/time-off': {
    setup: async (ctx) => ({
      ...(await instructorParams(ctx)),
      body: { start: RANGE.from, end: RANGE.to, reason: 'Cross tenant' },
    }),
  },
  'POST /v1/lessons': {
    setup: async (ctx) => {
      const instructor = await instructorOfA(ctx);
      const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
      const lessonTypeId = await insertLessonType(ctx.tenants, ctx.A);
      return {
        headers: { 'Idempotency-Key': `cross-tenant-${randomUUID()}` },
        body: {
          studentId,
          instructorMembershipId: instructor,
          lessonTypeId,
          start: '2030-01-08T09:00:00.000Z',
          pickupAddress: 'Torstr. 1',
          pickupLat: 52.53,
          pickupLng: 13.4,
        },
        aIds: [instructor, studentId, lessonTypeId],
      };
    },
  },
  'POST /v1/lessons/:id/cancel': {
    setup: async (ctx) => {
      const instructor = await instructorOfA(ctx);
      const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
      const lessonTypeId = await insertLessonType(ctx.tenants, ctx.A);
      const lessonId = await insertLesson(ctx.tenants, ctx.A, {
        studentId,
        instructorMembershipId: instructor,
        lessonTypeId,
        start: '2030-01-08T09:00:00.000Z',
      });
      return {
        params: { id: lessonId },
        body: { reason: 'Cross-tenant check' },
        aIds: [instructor, studentId, lessonTypeId, lessonId],
      };
    },
  },
  'PATCH /v1/lessons/:id': {
    setup: async (ctx) => {
      const instructor = await instructorOfA(ctx);
      const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
      const lessonTypeId = await insertLessonType(ctx.tenants, ctx.A);
      const lessonId = await insertLesson(ctx.tenants, ctx.A, {
        studentId,
        instructorMembershipId: instructor,
        lessonTypeId,
        start: '2030-01-08T09:00:00.000Z',
      });
      return {
        params: { id: lessonId },
        body: { start: '2030-01-08T11:00:00.000Z' },
        aIds: [instructor, studentId, lessonTypeId, lessonId],
      };
    },
  },
  'POST /v1/lessons/:id/complete': {
    setup: async (ctx) => ({ ...(await startedLessonOfA(ctx)), body: {} }),
  },
  'POST /v1/lessons/:id/no-show': {
    setup: async (ctx) => ({ ...(await startedLessonOfA(ctx)), body: {} }),
  },
  'GET /v1/waiting-list': {
    setup: async (ctx) => {
      const { studentId, lessonTypeId, entryId } = await waitingEntryOfA(ctx);
      return { aIds: [studentId, lessonTypeId, entryId] };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ items: [] });
    },
  },
  'POST /v1/waiting-list': {
    setup: async (ctx) => {
      const { studentId, lessonTypeId, entryId } = await waitingEntryOfA(ctx);
      return {
        body: {
          studentId,
          lessonTypeId,
          preferredWindows: [{ weekday: 2, start: '08:00', end: '18:00' }],
          area: 'Mitte',
        },
        aIds: [studentId, lessonTypeId, entryId],
      };
    },
  },
  'DELETE /v1/waiting-list/:id': {
    setup: async (ctx) => {
      const { studentId, lessonTypeId, entryId } = await waitingEntryOfA(ctx);
      return { params: { id: entryId }, aIds: [studentId, lessonTypeId] };
    },
  },
  'GET /v1/slot-offers': {
    setup: async (ctx) => {
      const { instructor, studentId, lessonTypeId, offerId } = await slotOfferOfA(ctx);
      return { aIds: [instructor, studentId, lessonTypeId, offerId] };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ items: [] });
    },
  },
  'POST /v1/slot-offers': {
    setup: async (ctx) => {
      const { instructor, studentId, lessonTypeId, offerId } = await slotOfferOfA(ctx);
      return {
        body: {
          instructorMembershipId: instructor,
          lessonTypeId,
          start: '2030-01-08T11:00:00.000Z',
          studentIds: [studentId],
        },
        aIds: [instructor, studentId, lessonTypeId, offerId],
      };
    },
  },
  'POST /v1/slot-offers/:id/accept': {
    setup: async (ctx) => {
      const { instructor, studentId, lessonTypeId, offerId } = await slotOfferOfA(ctx);
      return {
        params: { id: offerId },
        headers: { 'Idempotency-Key': `cross-tenant-${randomUUID()}` },
        body: { studentId },
        aIds: [instructor, studentId, lessonTypeId],
      };
    },
  },
  'GET /v1/sync': {
    setup: async (ctx) => {
      const { lessonIds, vehicleId } = await changeFeedOfA(ctx);
      return { query: { cursor: '0' }, aIds: [...lessonIds, vehicleId] };
    },
    expect: expectListResponse('items'),
  },
  'POST /v1/sync': {
    setup: async (ctx) => {
      const { aIds } = await startedLessonOfA(ctx);
      const [instructor, studentId, lessonTypeId, lessonId] = aIds as [
        string,
        string,
        string,
        string,
      ];
      const op = (type: string, baseVersion: number | null, payload: Record<string, unknown>) => ({
        opId: randomUUID(),
        clientAt: new Date().toISOString(),
        type,
        baseVersion,
        payload,
      });
      return {
        body: {
          ops: [
            op('lesson.cancel', 1, { lessonId }),
            op('lesson.complete', 1, { lessonId }),
            op('lesson.create', null, {
              lessonId: randomUUID(),
              studentId,
              lessonTypeId,
              vehicleId: null,
              start: '2030-01-08T09:00:00.000Z',
              pickupAddress: 'Torstr. 1',
              pickupLat: 52.53,
              pickupLng: 13.4,
            }),
            op('private_note.upsert', null, { privateNoteId: randomUUID(), lessonId, body: 'x' }),
          ],
        },
        aIds: [instructor, studentId, lessonTypeId, lessonId],
      };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      const results = (res.body as { results: { status: string; error: { code: string } }[] })
        .results;
      expect(results.map((result) => [result.status, result.error.code])).toEqual([
        ['rejected', 'not_found'],
        ['rejected', 'not_found'],
        ['rejected', 'not_found'],
        ['rejected', 'not_found'],
      ]);
    },
  },
};
