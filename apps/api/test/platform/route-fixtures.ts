import { randomUUID } from 'node:crypto';
import { auditLog } from '../../src/modules/platform/infra/schema.js';
import { platformStatements } from '../../src/modules/billing/infra/schema.js';
import {
  expectListResponse,
  type FixtureContext,
  type RouteFixtures,
} from '../support/cross-tenant.js';

let statementMonths = 0;

async function statementOfA({ tenants, A }: FixtureContext): Promise<string> {
  const id = randomUUID();
  statementMonths += 1;
  const month = new Date(Date.UTC(2026, 9 - statementMonths, 1)).toISOString().slice(0, 10);
  await tenants.asSchool(A, (tx) =>
    tx.insert(platformStatements).values({
      id,
      schoolId: A.schoolId,
      month,
      totalMinor: 4900,
      currency: 'EUR',
      status: 'issued',
      issuedAt: new Date(),
    }),
  );
  return id;
}

export const platformFixtures: RouteFixtures = {
  'POST /v1/platform/schools': {
    setup: async () => ({
      body: {
        name: 'Cross Tenant School',
        legalName: 'Cross Tenant School Ltd',
        address: '1 Cross St',
        countryCode: 'DE',
        timeZone: 'Europe/Berlin',
        currency: 'EUR',
        locale: 'en',
        planId: randomUUID(),
        owner: { fullName: 'Cross Owner', email: 'cross.owner@example.com' },
      },
    }),
  },
  'GET /v1/platform/plans': {},
  'POST /v1/platform/plans': {
    setup: async () => ({
      body: {
        code: 'cross-tenant',
        name: 'Cross',
        baseAmountMinor: 0,
        studentFeeMinor: 0,
        currency: 'EUR',
        maxInstructorSeats: null,
      },
    }),
  },
  'PATCH /v1/platform/plans/:id': {
    setup: async () => ({ params: { id: randomUUID() }, body: { active: false } }),
  },
  'GET /v1/platform/alerts': {},
  'GET /v1/platform/statements': {
    setup: async (ctx) => ({ aIds: [await statementOfA(ctx)] }),
  },
  'POST /v1/platform/statements/:id/mark-paid': {
    setup: async (ctx) => ({
      params: { id: await statementOfA(ctx) },
      body: { method: 'cash', paidAt: '2026-10-05T09:00:00.000Z' },
    }),
  },
  'POST /v1/platform/support-sessions': {
    setup: async ({ A }) => ({ body: { schoolId: A.schoolId, reason: 'cross tenant' } }),
  },
  'POST /v1/platform/support-sessions/:id/end': {
    setup: async () => ({ params: { id: randomUUID() } }),
  },
  'GET /v1/audit-log': {
    setup: async ({ tenants, A }) => {
      const id = randomUUID();
      await tenants.asSchool(A, (tx) =>
        tx.insert(auditLog).values({
          id,
          schoolId: A.schoolId,
          actorUserId: A.ownerUserId,
          action: 'students.read',
          targetType: 'student',
          targetId: randomUUID(),
          at: new Date(),
        }),
      );
      return { aIds: [id] };
    },
    expect: expectListResponse('items'),
  },
};
