import { expect } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { guardianLinks, syllabusItems } from '../../src/modules/training/infra/schema.js';
import { createStudent, createUser } from '../identity/support.js';
import {
  expectListResponse,
  type FixtureContext,
  type RouteFixtures,
} from '../support/cross-tenant.js';
import { createLessonRow } from './support.js';
import { StatusCodes } from 'http-status-codes';

const studentOfA = (ctx: FixtureContext) =>
  createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });

async function instructorOfA(ctx: FixtureContext): Promise<string> {
  const user = await createUser(ctx.tenants, {
    memberships: [{ tenant: ctx.A, roles: ['instructor'] }],
  });
  return user.membershipIds[0] as string;
}

const studentParams = async (ctx: FixtureContext) => {
  const id = await studentOfA(ctx);
  return { params: { id } };
};

export const trainingFixtures: RouteFixtures = {
  'GET /v1/students': {
    setup: async (ctx) => ({ aIds: [await studentOfA(ctx)] }),
    expect: expectListResponse('items'),
  },
  'POST /v1/students': {
    setup: async (ctx) => {
      const instructor = await instructorOfA(ctx);
      return {
        body: {
          fullName: 'Cross Tenant',
          dateOfBirth: '2000-01-01',
          licenceClass: 'B',
          examLanguage: 'en',
          primaryInstructorMembershipId: instructor,
        },
        aIds: [instructor],
      };
    },
    expect: (res) => expect(res.status).toBe(StatusCodes.BAD_REQUEST),
  },
  'GET /v1/students/:id': { setup: studentParams },
  'PATCH /v1/students/:id': {
    setup: async (ctx) => ({ ...(await studentParams(ctx)), body: { area: 'Elsewhere' } }),
  },
  'GET /v1/students/:id/instructors': { setup: studentParams },
  'PUT /v1/students/:id/instructors': {
    setup: async (ctx) => {
      const instructor = await instructorOfA(ctx);
      return {
        ...(await studentParams(ctx)),
        body: { instructors: [{ instructorMembershipId: instructor, isPrimary: true }] },
        aIds: [instructor],
      };
    },
  },
  'POST /v1/students/:id/enrolments': {
    setup: async (ctx) => ({
      ...(await studentParams(ctx)),
      body: { courseName: 'Class B', licenceClass: 'B' },
    }),
  },
  'POST /v1/students/:id/guardians': {
    setup: async (ctx) => {
      const parent = await createUser(ctx.tenants, {
        memberships: [{ tenant: ctx.A, roles: ['parent'] }],
      });
      return {
        ...(await studentParams(ctx)),
        body: { guardianUserId: parent.userId },
        aIds: [parent.userId],
      };
    },
  },
  'POST /v1/guardians/:linkId/consent': {
    setup: async (ctx) => {
      const studentId = await studentOfA(ctx);
      const linkId = newId();
      await ctx.tenants.asSchool(ctx.A, (tx) =>
        tx.insert(guardianLinks).values({
          id: linkId,
          schoolId: ctx.A.schoolId,
          studentId,
          guardianUserId: ctx.B.ownerUserId,
        }),
      );
      return {
        params: { linkId },
        body: { consentTextVersion: '2026-09' },
        aIds: [studentId],
      };
    },
  },
  'GET /v1/guardian-links': {
    setup: async (ctx) => {
      const studentId = await studentOfA(ctx);
      const linkId = newId();
      await ctx.tenants.asSchool(ctx.A, (tx) =>
        tx.insert(guardianLinks).values({
          id: linkId,
          schoolId: ctx.A.schoolId,
          studentId,
          guardianUserId: ctx.B.ownerUserId,
        }),
      );
      return { aIds: [linkId, studentId] };
    },
    expect: expectListResponse('items'),
  },
  'POST /v1/students/:id/archive': {
    setup: async (ctx) => ({ ...(await studentParams(ctx)), body: {} }),
  },
  'GET /v1/syllabus': {
    setup: async (ctx) => {
      const id = newId();
      await ctx.tenants.asSchool(ctx.A, (tx) =>
        tx.insert(syllabusItems).values({
          id,
          schoolId: ctx.A.schoolId,
          licenceClass: 'B',
          code: 'X01',
          title: 'Cross tenant topic',
          sortOrder: 1,
        }),
      );
      return { aIds: [id] };
    },
    expect: expectListResponse('items'),
  },
  'GET /v1/students/:id/progress': { setup: studentParams },
  'POST /v1/students/:id/test-attempts': {
    setup: async (ctx) => ({
      ...(await studentParams(ctx)),
      body: { kind: 'theory', takenOn: '2026-09-28', result: 'passed' },
    }),
  },
  'POST /v1/students/:id/export': { setup: studentParams },
  'DELETE /v1/students/:id': { setup: studentParams },
  'GET /v1/students/:id/private-notes': { setup: studentParams },
  'PUT /v1/students/:id/private-notes/:lessonId': {
    setup: async (ctx) => {
      const id = await studentOfA(ctx);
      const lessonId = await createLessonRow(ctx.tenants, ctx.A, {
        studentId: id,
        instructorMembershipId: ctx.A.ownerMembershipId,
        start: new Date(Date.UTC(2031, 0, 1, 9)),
      });
      return { params: { id, lessonId }, body: { body: 'Cross tenant note' }, aIds: [lessonId] };
    },
  },
};
