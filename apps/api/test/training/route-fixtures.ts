import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { guardianLinks, leads, syllabusItems } from '../../src/modules/training/infra/schema.js';
import { createStudent, createUser, uniquePhone } from '../identity/support.js';
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

async function leadOfA(ctx: FixtureContext, phone = uniquePhone()): Promise<string> {
  const id = newId();
  await ctx.tenants.asSchool(ctx.A, (tx) =>
    tx.insert(leads).values({
      id,
      schoolId: ctx.A.schoolId,
      source: 'page',
      fullName: 'Cross Tenant Lead',
      phone,
      licenceClass: 'B',
      isMinor: false,
      consentTextVersion: 'lead-consent.v1',
      consentedAt: new Date(),
    }),
  );
  return id;
}

const leadParams = async (ctx: FixtureContext) => ({ params: { id: await leadOfA(ctx) } });

export const trainingFixtures: RouteFixtures = {
  'GET /v1/leads': {
    setup: async (ctx) => ({ aIds: [await leadOfA(ctx)] }),
    expect: expectListResponse('items'),
  },
  'POST /v1/leads': {
    // B's plan has no enrolment_page (403); with it, B gets its own lead, never A's lead with the
    // same phone (the 30-day dedupe stays inside the school).
    setup: async (ctx) => {
      const phone = uniquePhone();
      return {
        body: { fullName: 'Cross Tenant', phone, licenceClass: 'B', isMinor: false },
        aIds: [await leadOfA(ctx, phone)],
      };
    },
    expect: (res) => expect([StatusCodes.CREATED, StatusCodes.FORBIDDEN]).toContain(res.status),
  },
  'GET /v1/leads/:id': { setup: leadParams },
  'PATCH /v1/leads/:id': {
    setup: async (ctx) => ({ ...(await leadParams(ctx)), body: { status: 'contacted' } }),
  },
  'POST /v1/leads/:id/convert': {
    setup: async (ctx) => ({
      ...(await leadParams(ctx)),
      body: { dateOfBirth: '2000-01-01', examLanguage: 'en' },
      headers: { 'Idempotency-Key': `cross-tenant-${randomUUID()}` },
    }),
  },
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
