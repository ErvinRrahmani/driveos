import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createLogin } from '../training/support.js';
import { seedDailyMetrics, seedReportingFixture } from './support.js';
import { StatusCodes } from 'http-status-codes';

const WEEKS = { from: '2026-10-12', to: '2026-10-25', bucket: 'week' };

describe('reports (read models only)', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    await seedReportingFixture(tenants, A);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const get = (path: string, query: Record<string, string>, tenant: TestTenant = A) =>
    http.get(`/v1/reports/${path}`).query(query).set(authHeaders(tenant));

  describe('GET /v1/reports/no-shows', () => {
    it('sums lessons due and no-shows per week with the rate in basis points', async () => {
      const res = await get('no-shows', WEEKS).expect(StatusCodes.OK);
      expect(res.body).toEqual({
        ...WEEKS,
        items: [
          { period: '2026-10-12', lessonsDue: 6, noShows: 2, noShowRateBp: 3333 },
          { period: '2026-10-19', lessonsDue: 3, noShows: 0, noShowRateBp: 0 },
        ],
        totals: { lessonsDue: 9, noShows: 2, noShowRateBp: 2222 },
      });
    });

    it('defaults to daily buckets', async () => {
      const res = await get('no-shows', { from: '2026-10-12', to: '2026-10-13' }).expect(
        StatusCodes.OK,
      );
      expect(res.body).toEqual({
        from: '2026-10-12',
        to: '2026-10-13',
        bucket: 'day',
        items: [
          { period: '2026-10-12', lessonsDue: 4, noShows: 1, noShowRateBp: 2500 },
          { period: '2026-10-13', lessonsDue: 0, noShows: 0, noShowRateBp: 0 },
        ],
        totals: { lessonsDue: 4, noShows: 1, noShowRateBp: 2500 },
      });
    });

    it('returns zeros for a range without data', async () => {
      const res = await get('no-shows', {
        from: '2027-01-01',
        to: '2027-01-31',
        bucket: 'month',
      }).expect(StatusCodes.OK);
      expect(res.body.items).toEqual([
        { period: '2027-01-01', lessonsDue: 0, noShows: 0, noShowRateBp: 0 },
      ]);
      expect(res.body.totals).toEqual({ lessonsDue: 0, noShows: 0, noShowRateBp: 0 });
    });
  });

  describe('GET /v1/reports/revenue', () => {
    it('sums revenue, refunds, upsells and package minutes per period in the school currency', async () => {
      const res = await get('revenue', WEEKS).expect(StatusCodes.OK);
      const week = {
        currency: 'EUR',
        revenueInAppMinor: 15_000,
        revenueRecordedMinor: 20_000,
        refundsMinor: 1_000,
        upsellsSold: 1,
        upsellRevenueMinor: 2_000,
        packageMinutesSold: 450,
      };
      expect(res.body).toEqual({
        ...WEEKS,
        items: [
          { period: '2026-10-12', ...week },
          {
            period: '2026-10-19',
            currency: 'EUR',
            revenueInAppMinor: 0,
            revenueRecordedMinor: 0,
            refundsMinor: 0,
            upsellsSold: 0,
            upsellRevenueMinor: 0,
            packageMinutesSold: 0,
          },
        ],
        totals: week,
      });
    });

    it('puts the last day of a month in that month', async () => {
      await seedDailyMetrics(tenants, A, '2026-09-30', {
        revenueInAppMinor: 777,
        revenueRecordedMinor: 777,
      });
      const res = await get('revenue', {
        from: '2026-09-01',
        to: '2026-10-31',
        bucket: 'month',
      }).expect(StatusCodes.OK);
      expect(
        res.body.items.map((item: { period: string; revenueInAppMinor: number }) => [
          item.period,
          item.revenueInAppMinor,
        ]),
      ).toEqual([
        ['2026-09-01', 777],
        ['2026-10-01', 15_000],
      ]);
    });
  });

  describe('GET /v1/reports/pass-rate', () => {
    it('gives attempts, passes and the pass rate per period and kind', async () => {
      const res = await get('pass-rate', WEEKS).expect(StatusCodes.OK);
      expect(res.body).toEqual({
        ...WEEKS,
        items: [
          { period: '2026-10-12', kind: 'theory', attempts: 3, passed: 2, passRateBp: 6667 },
          { period: '2026-10-12', kind: 'practical', attempts: 0, passed: 0, passRateBp: 0 },
          { period: '2026-10-19', kind: 'theory', attempts: 0, passed: 0, passRateBp: 0 },
          { period: '2026-10-19', kind: 'practical', attempts: 2, passed: 1, passRateBp: 5000 },
        ],
        totals: [
          { kind: 'theory', attempts: 3, passed: 2, passRateBp: 6667 },
          { kind: 'practical', attempts: 2, passed: 1, passRateBp: 5000 },
        ],
      });
    });
  });

  describe('GET /v1/reports/utilisation', () => {
    it('divides booked by available instructor minutes (availability minus time off)', async () => {
      const res = await get('utilisation', WEEKS).expect(StatusCodes.OK);
      expect(res.body).toEqual({
        ...WEEKS,
        items: [
          {
            period: '2026-10-12',
            instructorMinutesAvailable: 2_280,
            instructorMinutesBooked: 420,
            utilisationBp: 1842,
            slotsOffered: 2,
            slotsFilled: 1,
            slotFillMinutes: 90,
          },
          {
            period: '2026-10-19',
            instructorMinutesAvailable: 2_400,
            instructorMinutesBooked: 60,
            utilisationBp: 250,
            slotsOffered: 0,
            slotsFilled: 0,
            slotFillMinutes: 0,
          },
        ],
        totals: {
          instructorMinutesAvailable: 4_680,
          instructorMinutesBooked: 480,
          utilisationBp: 1026,
          slotsOffered: 2,
          slotsFilled: 1,
          slotFillMinutes: 90,
        },
      });
    });

    it('returns zeros before any availability was set', async () => {
      const res = await get('utilisation', { from: '2025-12-29', to: '2025-12-31' }).expect(
        StatusCodes.OK,
      );
      expect(res.body.items).toHaveLength(3);
      expect(res.body.totals).toEqual({
        instructorMinutesAvailable: 0,
        instructorMinutesBooked: 0,
        utilisationBp: 0,
        slotsOffered: 0,
        slotsFilled: 0,
        slotFillMinutes: 0,
      });
    });
  });

  describe('validation, permissions and tenancy', () => {
    it.each(['no-shows', 'revenue', 'pass-rate', 'utilisation'])(
      '%s: 400 when to is before from or a date is missing',
      async (path) => {
        const reversed = await get(path, { from: '2026-10-12', to: '2026-10-11' }).expect(
          StatusCodes.BAD_REQUEST,
        );
        expect(reversed.body.error.code).toBe('validation_error');
        await get(path, { from: '2026-10-12' }).expect(StatusCodes.BAD_REQUEST);
        await get(path, { from: '2026-10-12', to: '2026-10-13', bucket: 'year' }).expect(
          StatusCodes.BAD_REQUEST,
        );
      },
    );

    it('requires reports.read', async () => {
      const instructor = await createLogin(tenants, A, ['instructor']);
      await http
        .get('/v1/reports/no-shows')
        .query(WEEKS)
        .set(instructor.headers)
        .expect(StatusCodes.FORBIDDEN);
    });

    it("never shows another school's metrics", async () => {
      const res = await get('revenue', WEEKS, B).expect(StatusCodes.OK);
      expect(res.body.totals.revenueRecordedMinor).toBe(0);
      const utilisation = await get('utilisation', WEEKS, B).expect(StatusCodes.OK);
      expect(utilisation.body.totals.instructorMinutesAvailable).toBe(0);
      const passRate = await get('pass-rate', WEEKS, B).expect(StatusCodes.OK);
      expect(passRate.body.totals).toEqual([
        { kind: 'theory', attempts: 0, passed: 0, passRateBp: 0 },
        { kind: 'practical', attempts: 0, passed: 0, passRateBp: 0 },
      ]);
    });
  });
});
