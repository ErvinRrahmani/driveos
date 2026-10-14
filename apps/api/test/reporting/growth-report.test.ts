import { randomUUID } from 'node:crypto';
import { GrowthReportGenerated, growthReportSchema, PaymentSucceeded } from '@driveos/shared';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommandBus, type DomainEvent } from '../../src/kernel/cqrs/index.js';
import { ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { GenerateGrowthReportCommand } from '../../src/modules/reporting/index.js';
import { GrowthReportJob } from '../../src/modules/reporting/infra/growth-report.job.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { createLogin } from '../training/support.js';
import { seedDailyMetrics } from './support.js';
import { StatusCodes } from 'http-status-codes';

const PROJECTION = 'reporting.school-metrics';

interface ReportRow {
  id: string;
  month: string;
  currency: string;
  revenue_in_app_minor: number;
  revenue_recorded_minor: number;
  inapp_share_bp: number;
  late_cancellations_kept: number;
  late_cancel_minutes_kept: number;
  no_show_rate_bp: number;
  no_show_rate_prev3m_bp: number;
  upsells_sold: number;
  upsell_revenue_minor: number;
  slots_filled: number;
  slot_fill_minutes: number;
}

describe('monthly growth report', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    worker = await createWorkerTestHarness(db);
    await system.query(`update schools set time_zone = 'Europe/Budapest' where id = $1`, [
      A.schoolId,
    ]);
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const generate = (tenant: TestTenant, month: string) =>
    worker.tenant.runInTenant({ schoolId: tenant.schoolId, userId: null }, () =>
      worker.app.get(CommandBus).execute(new GenerateGrowthReportCommand(month)),
    );

  const reportsOf = async (tenant: TestTenant, month?: string): Promise<ReportRow[]> =>
    (
      await system.query<ReportRow>(
        `select id, to_char(month, 'YYYY-MM') as month, currency,
                revenue_in_app_minor::int, revenue_recorded_minor::int, inapp_share_bp,
                late_cancellations_kept, late_cancel_minutes_kept, no_show_rate_bp,
                no_show_rate_prev3m_bp, upsells_sold, upsell_revenue_minor::int, slots_filled,
                slot_fill_minutes
           from growth_reports where school_id = $1 and ($2::text is null or month = ($2 || '-01')::date)
          order by month`,
        [tenant.schoolId, month ?? null],
      )
    ).rows;

  const reportOf = async (tenant: TestTenant, month: string): Promise<ReportRow | undefined> =>
    (await reportsOf(tenant, month))[0];

  const eventsOf = async (tenant: TestTenant, month: string) =>
    (await expectEvents(db, { type: GrowthReportGenerated, schoolId: tenant.schoolId })).filter(
      (event) => event.payload.month === month,
    );

  const project = async (event: DomainEvent) => {
    const handler = worker.app.get(SubscriberRegistry).get(PROJECTION).handler;
    await worker.tenant.runInTenant({ schoolId: event.schoolId as string, userId: null }, () =>
      handler.handle(event, { subscriber: PROJECTION, attempt: 1 }),
    );
  };

  const payment = (tenant: TestTenant, amountMinor: number, occurredAt: string): DomainEvent => ({
    id: randomUUID(),
    type: PaymentSucceeded.type,
    version: PaymentSucceeded.version,
    schoolId: tenant.schoolId,
    aggregateType: 'payment',
    aggregateId: randomUUID(),
    aggregateVersion: 2,
    actorUserId: null,
    occurredAt: new Date(occurredAt),
    payload: {
      paymentId: randomUUID(),
      studentId: randomUUID(),
      payerUserId: null,
      amountMinor,
      currency: 'EUR',
      priceItemId: randomUUID(),
      priceItemKind: 'lesson',
      invoiceId: randomUUID(),
      method: 'in_app',
    },
  });

  const get = (query: Record<string, string>, headers: Record<string, string>) =>
    http.get('/v1/reports/growth').query(query).set(headers);

  describe('before any report exists', () => {
    it('GET /v1/reports/growth without a month answers 404 growth_report_missing', async () => {
      const res = await get({}, authHeaders(B)).expect(StatusCodes.NOT_FOUND);
      expect(res.body.error.code).toBe('growth_report_missing');
    });
  });

  describe('GenerateGrowthReportCommand', () => {
    it('aggregates the daily rows of the month into every metric', async () => {
      const second = await createLogin(tenants, A, ['owner', 'instructor']);
      const disabled = await createLogin(tenants, A, ['owner']);
      await system.query(`update memberships set status = 'disabled' where id = $1`, [
        disabled.membershipId,
      ]);
      await createLogin(tenants, A, ['office']);
      await seedDailyMetrics(tenants, A, '2026-03-01', {
        revenueInAppMinor: 30_000,
        revenueRecordedMinor: 40_000,
        refundsMinor: 2_000,
        lateCancellations: 1,
        lateCancelMinutesKept: 45,
        lessonsDue: 6,
        noShows: 1,
        lessonsCompleted: 5,
        upsellsSold: 1,
        upsellRevenueMinor: 5_000,
        slotsOffered: 3,
        slotsFilled: 1,
        slotFillMinutes: 90,
      });
      await seedDailyMetrics(tenants, A, '2026-03-31', {
        revenueInAppMinor: 10_000,
        revenueRecordedMinor: 20_000,
        lateCancellations: 2,
        lateCancelMinutesKept: 60,
        lessonsDue: 2,
        noShows: 1,
        slotsFilled: 2,
        slotFillMinutes: 120,
      });
      await seedDailyMetrics(tenants, A, '2025-12-01', { lessonsDue: 10, noShows: 3 });
      await seedDailyMetrics(tenants, A, '2026-01-31', { lessonsDue: 5 });
      await seedDailyMetrics(tenants, A, '2026-02-28', { lessonsDue: 5, noShows: 1 });
      await seedDailyMetrics(tenants, A, '2025-11-30', { lessonsDue: 100, noShows: 100 });
      await seedDailyMetrics(tenants, A, '2026-04-01', {
        revenueInAppMinor: 99_999,
        revenueRecordedMinor: 99_999,
        lessonsDue: 100,
        noShows: 100,
      });

      const result = await generate(A, '2026-03');

      const report = await reportOf(A, '2026-03');
      expect(report).toEqual({
        id: result.id,
        month: '2026-03',
        currency: 'EUR',
        revenue_in_app_minor: 40_000,
        revenue_recorded_minor: 60_000,
        inapp_share_bp: 6667,
        late_cancellations_kept: 3,
        late_cancel_minutes_kept: 105,
        no_show_rate_bp: 2500,
        no_show_rate_prev3m_bp: 2000,
        upsells_sold: 1,
        upsell_revenue_minor: 5_000,
        slots_filled: 3,
        slot_fill_minutes: 210,
      });
      const [event] = await eventsOf(A, '2026-03');
      expect(event).toMatchObject({
        aggregateType: 'growth_report',
        aggregateId: result.id,
        aggregateVersion: 1,
        payload: {
          reportId: result.id,
          month: '2026-03',
          currency: 'EUR',
          revenueInAppMinor: 40_000,
          revenueRecordedMinor: 60_000,
          inappShareBp: 6667,
          lateCancellationsKept: 3,
          lateCancelMinutesKept: 105,
          noShowRateBp: 2500,
          noShowRatePrev3mBp: 2000,
          upsellsSold: 1,
          upsellRevenueMinor: 5_000,
          slotsFilled: 3,
          slotFillMinutes: 210,
        },
      });
      expect([...(event?.payload.ownerUserIds ?? [])].sort()).toEqual(
        [A.ownerUserId, second.userId].sort(),
      );
    });

    it('writes zeros, not a division error, for a month without data', async () => {
      await generate(B, '2025-05');
      expect(await reportOf(B, '2025-05')).toMatchObject({
        revenue_in_app_minor: 0,
        revenue_recorded_minor: 0,
        inapp_share_bp: 0,
        no_show_rate_bp: 0,
        no_show_rate_prev3m_bp: 0,
        slots_filled: 0,
      });
    });

    it('rejects a malformed month', async () => {
      await expect(generate(A, '2026-13')).rejects.toThrow(RangeError);
    });

    it('puts a payment at 23:30 local on the last day into that month only', async () => {
      await project(payment(A, 12_345, '2026-08-31T21:30:00Z'));
      await project(payment(A, 700, '2026-08-31T22:30:00Z'));

      await generate(A, '2026-08');
      await generate(A, '2026-09');

      expect(await reportOf(A, '2026-08')).toMatchObject({
        revenue_in_app_minor: 12_345,
        revenue_recorded_minor: 12_345,
      });
      expect(await reportOf(A, '2026-09')).toMatchObject({
        revenue_in_app_minor: 700,
        revenue_recorded_minor: 700,
      });
    });

    it('counts a replayed event once and generates one report per month', async () => {
      const event = payment(A, 4_200, '2026-05-10T10:00:00Z');
      await project(event);
      await project(event);

      const first = await generate(A, '2026-05');
      await project(event);
      const second = await generate(A, '2026-05');

      expect(second).toEqual(first);
      const reports = await reportsOf(A, '2026-05');
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ id: first.id, revenue_in_app_minor: 4_200 });
      const events = await eventsOf(A, '2026-05');
      expect(events).toHaveLength(1);
      expect(events[0]?.payload.revenueInAppMinor).toBe(4_200);
    });
  });

  describe('job reporting.growth-report', () => {
    const job = () => worker.app.get(GrowthReportJob);

    it('is registered hourly', () => {
      expect(
        worker.app
          .get(ScheduledJobs)
          .list()
          .find((definition) => definition.name === 'reporting.growth-report'),
      ).toMatchObject({ pattern: '0 * * * *' });
    });

    it('creates the previous month at 03:00 local on the 1st, once', async () => {
      await job().run(new Date('2026-11-01T01:59:00Z'));
      expect(await reportOf(A, '2026-10')).toBeUndefined();

      await job().run(new Date('2026-11-01T02:00:00Z'));
      expect(await reportOf(A, '2026-10')).toBeDefined();
      expect(await reportOf(B, '2026-10')).toBeUndefined();

      await job().run(new Date('2026-11-01T03:00:00Z'));
      expect(await reportsOf(A, '2026-10')).toHaveLength(1);
      expect(await eventsOf(A, '2026-10')).toHaveLength(1);
    });

    it('catches up a missed month later in the month', async () => {
      expect(await reportOf(A, '2026-11')).toBeUndefined();
      await job().run(new Date('2026-12-15T10:00:00Z'));
      expect(await reportOf(A, '2026-11')).toBeDefined();
      expect(await reportOf(B, '2026-11')).toBeDefined();
      expect(await eventsOf(A, '2026-11')).toHaveLength(1);
    });
  });

  describe('GET /v1/reports/growth', () => {
    it('returns the report of the given month', async () => {
      const [row] = await reportsOf(A, '2026-03');
      const res = await get({ month: '2026-03' }, authHeaders(A)).expect(StatusCodes.OK);
      expect(growthReportSchema.parse(res.body)).toEqual(res.body);
      expect(res.body).toMatchObject({
        id: row?.id,
        month: '2026-03',
        currency: 'EUR',
        revenueInAppMinor: 40_000,
        revenueRecordedMinor: 60_000,
        inappShareBp: 6667,
        lateCancellationsKept: 3,
        lateCancelMinutesKept: 105,
        noShowRateBp: 2500,
        noShowRatePrev3mBp: 2000,
        upsellsSold: 1,
        upsellRevenueMinor: 5_000,
        slotsFilled: 3,
        slotFillMinutes: 210,
      });
      expect(Number.isNaN(Date.parse(res.body.generatedAt))).toBe(false);
    });

    it('returns the latest report without a month', async () => {
      const latest = (await reportsOf(A)).at(-1);
      const res = await get({}, authHeaders(A)).expect(StatusCodes.OK);
      expect(res.body).toMatchObject({ id: latest?.id, month: latest?.month });
    });

    it('answers 404 growth_report_missing for a month without a report', async () => {
      const res = await get({ month: '2020-01' }, authHeaders(A)).expect(StatusCodes.NOT_FOUND);
      expect(res.body.error.code).toBe('growth_report_missing');
    });

    it('rejects a malformed month', async () => {
      await get({ month: '2026-3' }, authHeaders(A)).expect(StatusCodes.BAD_REQUEST);
    });

    it('requires reports.read', async () => {
      const instructor = await createLogin(tenants, A, ['instructor']);
      await get({ month: '2026-03' }, instructor.headers).expect(StatusCodes.FORBIDDEN);
    });

    it("never returns another school's report", async () => {
      const [row] = await reportsOf(A, '2026-03');
      const res = await get({ month: '2026-03' }, authHeaders(B)).expect(StatusCodes.NOT_FOUND);
      expect(JSON.stringify(res.body)).not.toContain(row?.id ?? 'missing');
      const latest = await get({}, authHeaders(B)).expect(StatusCodes.OK);
      expect(latest.body.month).toBe('2026-11');
    });
  });
});
