import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { billingFixtures } from '../billing/route-fixtures.js';
import { documentsFixtures } from '../documents/route-fixtures.js';
import { messagingFixtures } from '../messaging/route-fixtures.js';
import { identityFixtures } from '../identity/route-fixtures.js';
import { platformFixtures } from '../platform/route-fixtures.js';
import { reportingFixtures } from '../reporting/route-fixtures.js';
import { schedulingFixtures } from '../scheduling/route-fixtures.js';
import { schoolFixtures } from '../school/route-fixtures.js';
import { theoryFixtures } from '../theory/route-fixtures.js';
import { trainingFixtures } from '../training/route-fixtures.js';
import type { RouteFixture, RouteFixtures } from './cross-tenant.js';
import { StatusCodes } from 'http-status-codes';

async function recordPingAsA(
  ctx: Parameters<NonNullable<RouteFixtures[string]['setup']>>[0],
  key: string,
  body: { message: string },
): Promise<string> {
  const res = await ctx.request
    .post('/v1/ping')
    .set(ctx.auth(ctx.A))
    .set('Idempotency-Key', key)
    .send(body);
  expect(res.status).toBe(StatusCodes.CREATED);
  return (res.body as { id: string }).id;
}

const pingFixtures: RouteFixtures = {
  'POST /v1/ping': {
    setup: async (ctx) => {
      const key = `cross-tenant-${randomUUID()}`;
      const body = { message: 'from school A' };
      const id = await recordPingAsA(ctx, key, body);
      return { body, headers: { 'Idempotency-Key': key }, aIds: [id] };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.CREATED);
    },
  },
  'GET /v1/ping': {
    setup: async (ctx) => {
      const id = await recordPingAsA(ctx, `cross-tenant-${randomUUID()}`, { message: 'A' });
      return { aIds: [id] };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ count: 0 });
    },
  },
};

function merge(...groups: RouteFixtures[]): RouteFixtures {
  const merged: RouteFixtures = {};
  for (const group of groups) {
    for (const [key, fixture] of Object.entries(group)) {
      if (merged[key]) throw new Error(`Duplicate cross-tenant fixture for ${key}`);
      merged[key] = fixture;
    }
  }
  return merged;
}

export const ROUTE_FIXTURES: RouteFixtures = merge(
  pingFixtures,
  identityFixtures,
  schoolFixtures,
  platformFixtures,
  billingFixtures,
  trainingFixtures,
  schedulingFixtures,
  documentsFixtures,
  messagingFixtures,
  theoryFixtures,
  reportingFixtures,
);

export function fixtureFor(key: string): RouteFixture {
  const fixture = ROUTE_FIXTURES[key];
  if (!fixture) throw new Error(`No cross-tenant fixture for ${key}`);
  return fixture;
}
