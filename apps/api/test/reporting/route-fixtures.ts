import { expect } from 'vitest';
import type { FixtureContext, RouteFixtures } from '../support/cross-tenant.js';
import { type ReportingFixture, seedGrowthReport, seedReportingFixture } from './support.js';
import { StatusCodes } from 'http-status-codes';

const RANGE = { from: '2026-10-12', to: '2026-10-25', bucket: 'week' };

const seeded = new Map<string, Promise<ReportingFixture>>();
const growthSeeded = new Map<string, Promise<string>>();

async function metricsOfA(ctx: FixtureContext) {
  let fixture = seeded.get(ctx.A.schoolId);
  if (!fixture) {
    fixture = seedReportingFixture(ctx.tenants, ctx.A);
    seeded.set(ctx.A.schoolId, fixture);
  }
  const { instructorMembershipId, timeOffId } = await fixture;
  return { query: RANGE, aIds: [instructorMembershipId, timeOffId] };
}

const zeroItems = (body: { items: Record<string, unknown>[] }, keys: readonly string[]) => {
  for (const item of body.items) {
    for (const key of keys) expect(item[key]).toBe(0);
  }
};

export const reportingFixtures: RouteFixtures = {
  'GET /v1/reports/growth': {
    setup: async (ctx) => {
      let report = growthSeeded.get(ctx.A.schoolId);
      if (!report) {
        report = seedGrowthReport(ctx.tenants, ctx.A, '2026-09');
        growthSeeded.set(ctx.A.schoolId, report);
      }
      return { query: { month: '2026-09' }, aIds: [await report] };
    },
  },
  'GET /v1/reports/no-shows': {
    setup: metricsOfA,
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.totals).toEqual({ lessonsDue: 0, noShows: 0, noShowRateBp: 0 });
      zeroItems(res.body, ['lessonsDue', 'noShows']);
    },
  },
  'GET /v1/reports/revenue': {
    setup: metricsOfA,
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.totals).toMatchObject({
        revenueInAppMinor: 0,
        revenueRecordedMinor: 0,
        refundsMinor: 0,
        upsellsSold: 0,
        upsellRevenueMinor: 0,
        packageMinutesSold: 0,
      });
      zeroItems(res.body, ['revenueInAppMinor', 'revenueRecordedMinor', 'refundsMinor']);
    },
  },
  'GET /v1/reports/pass-rate': {
    setup: metricsOfA,
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.totals).toEqual([
        { kind: 'theory', attempts: 0, passed: 0, passRateBp: 0 },
        { kind: 'practical', attempts: 0, passed: 0, passRateBp: 0 },
      ]);
    },
  },
  'GET /v1/reports/utilisation': {
    setup: metricsOfA,
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.totals).toEqual({
        instructorMinutesAvailable: 0,
        instructorMinutesBooked: 0,
        utilisationBp: 0,
        slotsOffered: 0,
        slotsFilled: 0,
        slotFillMinutes: 0,
      });
    },
  },
};
