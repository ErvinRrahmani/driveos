import { expect } from 'vitest';
import {
  expectListResponse,
  type FixtureContext,
  type RouteFixtures,
} from '../support/cross-tenant.js';
import { StatusCodes } from 'http-status-codes';

const branchBody = { name: 'Fixture branch', address: '1 Fixture St', lat: 52.5, lng: 13.4 };

async function branchOfA(ctx: FixtureContext): Promise<string> {
  const res = await ctx.request.post('/v1/branches').set(ctx.auth(ctx.A)).send(branchBody);
  expect(res.status).toBe(StatusCodes.CREATED);
  return res.body.id as string;
}

async function vehicleOfA(ctx: FixtureContext): Promise<{ branchId: string; vehicleId: string }> {
  const branchId = await branchOfA(ctx);
  const res = await ctx.request.post('/v1/vehicles').set(ctx.auth(ctx.A)).send({
    branchId,
    plate: 'A-FX 1',
    makeModel: 'VW Golf',
    transmission: 'manual',
    licenceClass: 'B',
  });
  expect(res.status).toBe(StatusCodes.CREATED);
  return { branchId, vehicleId: res.body.id as string };
}

async function openingHoursOfA(ctx: FixtureContext): Promise<string[]> {
  const branchId = await branchOfA(ctx);
  const res = await ctx.request
    .put('/v1/school/opening-hours')
    .set(ctx.auth(ctx.A))
    .send({ items: [{ branchId, weekday: 1, opens: '08:00', closes: '18:00' }] });
  expect(res.status).toBe(StatusCodes.OK);
  return [branchId, ...res.body.items.map((item: { id: string }) => item.id)];
}

const ownSchool = (res: { status: number; body: { id?: string } }, ctx: FixtureContext) => {
  expect(res.status).toBe(StatusCodes.OK);
  expect(res.body.id).toBe(ctx.B.schoolId);
};

export const schoolFixtures: RouteFixtures = {
  'GET /v1/school': { expect: ownSchool },
  'PATCH /v1/school': {
    setup: async () => ({ body: { name: 'Renamed by B' } }),
    expect: async (res, ctx) => {
      ownSchool(res, ctx);
      const a = await ctx.request.get('/v1/school').set(ctx.auth(ctx.A));
      expect(a.body.name).not.toBe('Renamed by B');
    },
  },
  'GET /v1/school/settings': {
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
    },
  },
  'PATCH /v1/school/settings': {
    setup: async () => ({ body: { minGapMinutes: 15 } }),
    expect: ownSchool,
  },
  'GET /v1/school/opening-hours': {
    setup: async (ctx) => ({ aIds: await openingHoursOfA(ctx) }),
    expect: expectListResponse('items'),
  },
  'PUT /v1/school/opening-hours': {
    setup: async (ctx) => {
      const branchId = await branchOfA(ctx);
      return {
        body: { items: [{ branchId, weekday: 2, opens: '08:00', closes: '12:00' }] },
        aIds: [branchId],
      };
    },
  },
  'GET /v1/branches': {
    setup: async (ctx) => ({ aIds: [await branchOfA(ctx)] }),
    expect: expectListResponse('items'),
  },
  'POST /v1/branches': {
    setup: async (ctx) => ({ body: branchBody, aIds: [await branchOfA(ctx)] }),
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.CREATED);
    },
  },
  'PATCH /v1/branches/:id': {
    setup: async (ctx) => ({ params: { id: await branchOfA(ctx) }, body: { name: 'Taken by B' } }),
  },
  'GET /v1/vehicles': {
    setup: async (ctx) => ({ aIds: Object.values(await vehicleOfA(ctx)) }),
    expect: expectListResponse('items'),
  },
  'POST /v1/vehicles': {
    setup: async (ctx) => {
      const { branchId, vehicleId } = await vehicleOfA(ctx);
      return {
        body: {
          branchId,
          plate: 'B-FX 1',
          makeModel: 'VW Polo',
          transmission: 'manual',
          licenceClass: 'B',
        },
        aIds: [branchId, vehicleId],
      };
    },
  },
  'PATCH /v1/vehicles/:id': {
    setup: async (ctx) => {
      const { branchId, vehicleId } = await vehicleOfA(ctx);
      return { params: { id: vehicleId }, body: { active: false }, aIds: [branchId] };
    },
  },
  'GET /v1/staff': { expect: expectListResponse('items') },
  'POST /v1/school/payment-account': {
    setup: async (ctx) => {
      const res = await ctx.request
        .post('/v1/school/payment-account')
        .set(ctx.auth(ctx.A))
        .send({ provider: 'fake' });
      expect(res.status).toBe(StatusCodes.OK);
      return { body: { provider: 'fake' }, aIds: [res.body.id as string] };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
    },
  },
};
