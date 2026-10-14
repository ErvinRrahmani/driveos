import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { memberships } from '../../src/modules/identity/infra/schema.js';
import {
  assertNoLeak,
  expectListResponse,
  type FixtureContext,
  type RouteFixtures,
} from '../support/cross-tenant.js';
import { createStudent, createUser, uniqueEmail } from './support.js';
import { StatusCodes } from 'http-status-codes';

async function inviteAsA(ctx: FixtureContext): Promise<{ id: string; token: string }> {
  const res = await ctx.request
    .post('/v1/invitations')
    .set(ctx.auth(ctx.A))
    .send({ roles: ['instructor'], email: uniqueEmail() });
  expect(res.status).toBe(StatusCodes.CREATED);
  return { id: res.body.id as string, token: res.body.acceptToken as string };
}

export const identityFixtures: RouteFixtures = {
  'POST /v1/me/switch-school': {
    setup: async ({ A }) => ({ body: { membershipId: A.ownerMembershipId } }),
  },
  'POST /v1/devices': {
    setup: async ({ request, A, auth }) => {
      const pushToken = `ExponentPushToken[cross-tenant-${randomUUID()}]`;
      const res = await request
        .post('/v1/devices')
        .set(auth(A))
        .send({ platform: 'ios', pushToken, locale: 'en' });
      expect(res.status).toBe(StatusCodes.CREATED);
      return {
        body: { platform: 'android', pushToken, locale: 'en' },
        aIds: [(res.body as { id: string }).id],
      };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.CREATED);
    },
  },
  'POST /v1/invitations': {
    setup: async ({ tenants, A }) => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
      return {
        body: { roles: ['student'], email: uniqueEmail(), studentId },
        aIds: [studentId],
      };
    },
  },
  'GET /v1/invitations': {
    setup: async (ctx) => ({ aIds: [(await inviteAsA(ctx)).id] }),
    expect: expectListResponse('items'),
  },
  'POST /v1/invitations/:token/accept': {
    setup: async (ctx) => {
      const { id, token } = await inviteAsA(ctx);
      return { params: { token }, body: { fullName: 'Cross Tenant' }, aIds: [id] };
    },
    expect: async (res, { tenants, A, B }) => {
      expect(res.status).toBe(StatusCodes.OK);
      assertNoLeak('POST /v1/invitations/:token/accept', res, [
        B.schoolId,
        B.ownerUserId,
        B.ownerMembershipId,
      ]);
      const membershipId = res.body.membershipId as string;
      const inA = await tenants.asSchool(A, (tx) =>
        tx.select().from(memberships).where(eq(memberships.id, membershipId)),
      );
      expect(inA).toHaveLength(1);
      const inB = await tenants.asSchool(B, (tx) =>
        tx.select().from(memberships).where(eq(memberships.id, membershipId)),
      );
      expect(inB).toHaveLength(0);
    },
  },
  'PATCH /v1/memberships/:id': {
    setup: async ({ tenants, A }) => {
      const user = await createUser(tenants, { memberships: [{ tenant: A, roles: ['office'] }] });
      return {
        params: { id: user.membershipIds[0] as string },
        body: { roles: ['instructor'], disabled: true },
        aIds: [user.userId],
      };
    },
  },
};
