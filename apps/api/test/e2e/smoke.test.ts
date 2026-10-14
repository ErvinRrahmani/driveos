import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { newId } from '../../src/kernel/db/columns.js';
import { JobProcessors, JobQueues, ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { OutboxRelayLoop } from '../../src/kernel/outbox/index.js';
import { EventsWorker, SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { WorkerLifecycle } from '../../src/kernel/worker/worker-lifecycle.js';
import { NotificationDispatchJob } from '../../src/modules/messaging/infra/notification-dispatch.job.js';
import { GrowthReportJob } from '../../src/modules/reporting/infra/growth-report.job.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { birthDateYearsAgo, uniqueEmail, uniquePhone, waitForCode } from '../identity/support.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const WAIT_MS = 15_000;
const HOUR = 3_600_000;

const idBody = z.object({ id: z.uuid() });
const sessionBody = z.object({ accessToken: z.string() });
const acceptBody = z.object({
  membershipId: z.uuid(),
  status: z.string(),
  studentId: z.uuid().nullable(),
});
const schoolBody = z.object({ schoolId: z.uuid(), acceptToken: z.string() });
const settingsBody = z.object({ ageOfMajority: z.number() });
const inviteBody = z.object({ acceptToken: z.string() });
const guardianBody = z.object({ pending: z.boolean() });
const linksBody = z.object({
  items: z.array(z.object({ id: z.uuid(), studentId: z.uuid(), status: z.string() })),
});
const shopBody = z.object({
  checkoutEnabled: z.boolean(),
  balanceMinutes: z.number(),
  items: z.array(z.looseObject({ id: z.uuid() })),
});
const checkoutBody = z.object({ paymentId: z.uuid(), checkoutUrl: z.url() });
const balanceBody = z.object({ balanceMinutes: z.number() });
const listBody = z.object({ items: z.array(z.looseObject({ id: z.uuid() })) });
const lessonBody = z.looseObject({ id: z.uuid(), version: z.number().int() });
const syncBody = z.object({ results: z.array(z.looseObject({ status: z.string() })) });
const progressBody = z.object({ syllabus: z.array(z.unknown()), entries: z.array(z.unknown()) });
const looseBody = z.looseObject({});

interface Reply {
  status: number;
  body: unknown;
  text: string;
}

async function until<T>(label: string, probe: () => Promise<T | null | undefined | false>) {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function localZone(now: Date): { zone: string; offsetHours: number } {
  const offsetHours = Math.max(-12, Math.min(14, 12 - now.getUTCHours()));
  if (offsetHours === 0) return { zone: 'Etc/UTC', offsetHours };
  return {
    zone: offsetHours > 0 ? `Etc/GMT-${offsetHours}` : `Etc/GMT+${-offsetHours}`,
    offsetHours,
  };
}

describe('end-to-end smoke: school to growth report', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let lifecycle: WorkerLifecycle;
  let kernel: KernelTestApp;
  let baseUrl: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db, [], { OUTBOX_POLL_MS: '50' });
    const app = worker.app;
    lifecycle = new WorkerLifecycle(
      app.get(OutboxRelayLoop),
      app.get(EventsWorker),
      app.get(ScheduledJobs),
      app.get(SubscriberRegistry),
      app.get(JobQueues),
      app.get(JobProcessors),
    );
    await lifecycle.onApplicationBootstrap();
    kernel = await createKernelTestApp(db, [], { env: { JOBS_PREFIX: worker.prefix } });
    await kernel.app.listen(0, '127.0.0.1');
    const { port } = kernel.app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 60_000);

  afterAll(async () => {
    await lifecycle?.onModuleDestroy();
    await kernel?.close();
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  async function call(
    method: string,
    path: string,
    options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Reply> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    const json = response.headers.get('content-type')?.includes('application/json');
    return { status: response.status, body: json && text ? JSON.parse(text) : null, text };
  }

  async function expectStatus<T extends z.ZodType>(
    reply: Promise<Reply>,
    status: number,
    schema: T,
  ): Promise<z.output<T>> {
    const res = await reply;
    expect(res.status, res.text).toBe(status);
    return schema.parse(res.body);
  }

  async function login(contact: string): Promise<string> {
    await expectStatus(
      call('POST', '/v1/auth/code', { body: { contact } }),
      StatusCodes.ACCEPTED,
      z.unknown(),
    );
    const code = await waitForCode(kernel, contact);
    const session = await expectStatus(
      call('POST', '/v1/auth/verify', { body: { contact, code, client: 'mobile' } }),
      StatusCodes.OK,
      sessionBody,
    );
    return session.accessToken;
  }

  async function accept(token: string, fullName: string) {
    return expectStatus(
      call('POST', `/v1/invitations/${token}/accept`, { body: { fullName, locale: 'en' } }),
      StatusCodes.OK,
      acceptBody,
    );
  }

  async function workerMessage(contact: string, pattern: RegExp): Promise<RegExpExecArray> {
    const dispatch = worker.app.get(NotificationDispatchJob);
    return until(`a message to ${contact} matching ${pattern}`, async () => {
      await dispatch.dispatch();
      const bodies = [
        ...worker.sms.sent.filter((m) => m.to === contact).map((m) => m.body),
        ...worker.email.sent.filter((m) => m.to === contact).map((m) => m.text),
      ];
      const body = bodies.find((text) => pattern.test(text));
      return body ? pattern.exec(body) : null;
    });
  }

  it('runs a minor student from invitation to the monthly growth report', async () => {
    const now = new Date();
    const { zone, offsetHours } = localZone(now);
    const local = new Date(now.getTime() + offsetHours * HOUR);
    const localDay = local.toISOString().slice(0, 10);
    const month = localDay.slice(0, 7);

    const adminPhone = uniquePhone();
    const adminId = newId();
    await system.query(
      `insert into users (id, full_name, phone, locale) values ($1, 'Pia Platform', $2, 'en')`,
      [adminId, adminPhone],
    );
    await system.query('insert into platform_admins (user_id) values ($1)', [adminId]);
    const platform = await login(adminPhone);
    const plan = await expectStatus(
      call('POST', '/v1/platform/plans', {
        token: platform,
        body: {
          code: `smoke-${newId().slice(-8)}`,
          name: 'Smoke plan',
          baseAmountMinor: 4900,
          studentFeeMinor: 300,
          currency: 'EUR',
          maxInstructorSeats: null,
        },
      }),
      StatusCodes.CREATED,
      idBody,
    );

    const ownerPhone = uniquePhone();
    const created = await expectStatus(
      call('POST', '/v1/platform/schools', {
        token: platform,
        body: {
          name: 'Smoke Driving School',
          legalName: 'Smoke Driving School GmbH',
          address: '1 Smoke Street',
          countryCode: 'DE',
          timeZone: zone,
          currency: 'EUR',
          locale: 'en',
          planId: plan.id,
          owner: { fullName: 'Olga Owner', phone: ownerPhone },
        },
      }),
      StatusCodes.CREATED,
      schoolBody,
    );
    const schoolId = created.schoolId;
    expect((await accept(created.acceptToken, 'Olga Owner')).status).toBe('active');
    const owner = await login(ownerPhone);
    const settings = await expectStatus(
      call('GET', '/v1/school/settings', { token: owner }),
      StatusCodes.OK,
      settingsBody,
    );
    expect(settings.ageOfMajority).toBe(18);

    const branch = await expectStatus(
      call('POST', '/v1/branches', {
        token: owner,
        body: { name: 'Centre', address: '1 Smoke Street', lat: 52.52, lng: 13.4 },
      }),
      StatusCodes.CREATED,
      idBody,
    );
    const vehicle = await expectStatus(
      call('POST', '/v1/vehicles', {
        token: owner,
        body: {
          branchId: branch.id,
          plate: 'SM-OK 1',
          makeModel: 'VW Golf',
          transmission: 'manual',
          licenceClass: 'B',
        },
      }),
      StatusCodes.CREATED,
      idBody,
    );
    const lessonType = await expectStatus(
      call('POST', '/v1/lesson-types', {
        token: owner,
        body: {
          name: 'Standard lesson',
          kind: 'lesson',
          licenceClass: 'B',
          minutes: 60,
          creditMinutes: 60,
          requiresVehicle: true,
          requiresEntitlement: null,
        },
      }),
      StatusCodes.CREATED,
      idBody,
    );
    const packageItem = await expectStatus(
      call('POST', '/v1/price-items', {
        token: owner,
        body: {
          name: 'Starter package',
          kind: 'package',
          creditMinutes: 120,
          amountMinor: 11_900,
          currency: 'EUR',
          taxRateBp: 1900,
        },
      }),
      StatusCodes.CREATED,
      idBody,
    );
    await expectStatus(
      call('POST', '/v1/school/payment-account', { token: owner, body: { provider: 'fake' } }),
      StatusCodes.OK,
      z.unknown(),
    );
    const syllabusItemId = newId();
    await system.query(
      `insert into syllabus_items (id, school_id, licence_class, code, title, sort_order)
         values ($1, $2, 'B', 'B-01', 'Moving off and stopping', 1)`,
      [syllabusItemId, schoolId],
    );

    const instructorPhone = uniquePhone();
    const instructorInvite = await expectStatus(
      call('POST', '/v1/invitations', {
        token: owner,
        body: { roles: ['instructor'], phone: instructorPhone, branchIds: [branch.id] },
      }),
      StatusCodes.CREATED,
      inviteBody,
    );
    const instructorMembershipId = (await accept(instructorInvite.acceptToken, 'Ivan Instructor'))
      .membershipId;
    const instructor = await login(instructorPhone);
    await expectStatus(
      call('PUT', `/v1/instructors/${instructorMembershipId}/availability`, {
        token: instructor,
        body: {
          effectiveFrom: localDay,
          windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            weekday,
            startTime: '00:00',
            endTime: '23:59',
          })),
        },
      }),
      StatusCodes.OK,
      z.unknown(),
    );

    const student = await expectStatus(
      call('POST', '/v1/students', {
        token: owner,
        body: {
          fullName: 'Mia Minor',
          dateOfBirth: birthDateYearsAgo(16),
          licenceClass: 'B',
          examLanguage: 'en',
          pickupAddress: '2 Smoke Street',
          pickupLat: 52.53,
          pickupLng: 13.41,
          primaryInstructorMembershipId: instructorMembershipId,
        },
      }),
      StatusCodes.CREATED,
      idBody,
    );
    const studentId = student.id;
    const studentPhone = uniquePhone();
    const studentInvite = await expectStatus(
      call('POST', '/v1/invitations', {
        token: owner,
        body: { roles: ['student'], phone: studentPhone, studentId },
      }),
      StatusCodes.CREATED,
      inviteBody,
    );
    const studentMember = await accept(studentInvite.acceptToken, 'Mia Minor');
    expect(studentMember.status).toBe('pending_consent');
    expect(studentMember.studentId).toBe(studentId);
    await expectStatus(
      call('POST', '/v1/auth/code', { body: { contact: studentPhone } }),
      StatusCodes.ACCEPTED,
      z.unknown(),
    );
    expect(kernel.sms.sent.filter((m) => m.to === studentPhone)).toEqual([]);

    const guardianEmail = uniqueEmail();
    const guardianAdded = await expectStatus(
      call('POST', `/v1/students/${studentId}/guardians`, {
        token: owner,
        body: { email: guardianEmail },
      }),
      StatusCodes.CREATED,
      guardianBody,
    );
    expect(guardianAdded.pending).toBe(true);
    const [, guardianToken] = await workerMessage(
      guardianEmail,
      /\/invitations\/([A-Za-z0-9_-]{43})/,
    );
    expect((await accept(guardianToken ?? '', 'Gina Guardian')).status).toBe('active');
    const guardian = await login(guardianEmail);
    const link = await until('the guardian link', async () => {
      const links = await expectStatus(
        call('GET', '/v1/guardian-links', { token: guardian }),
        StatusCodes.OK,
        linksBody,
      );
      return links.items.find((item) => item.studentId === studentId);
    });
    expect(link.status).toBe('pending_consent');
    await workerMessage(guardianEmail, new RegExp(`/parent/consent/${link.id}`));
    const consentNotice = await system.query<{ channel: string; status: string }>(
      `select channel, status from notifications
          where school_id = $1 and template = 'guardian_consent_requested' order by channel::text`,
      [schoolId],
    );
    expect(consentNotice.rows).toEqual([
      { channel: 'email', status: 'sent' },
      { channel: 'push', status: 'skipped' },
    ]);

    await expectStatus(
      call('POST', `/v1/guardians/${link.id}/consent`, {
        token: guardian,
        body: { consentTextVersion: '2026-01' },
      }),
      StatusCodes.OK,
      z.unknown(),
    );
    await until('the student membership to become active', async () => {
      const { rows } = await system.query<{ status: string }>(
        'select status from memberships where id = $1',
        [studentMember.membershipId],
      );
      return rows[0]?.status === 'active';
    });
    const pupil = await login(studentPhone);

    const shop = await expectStatus(
      call('GET', `/v1/shop?studentId=${studentId}`, { token: pupil }),
      StatusCodes.OK,
      shopBody,
    );
    expect(shop.checkoutEnabled).toBe(true);
    expect(shop.balanceMinutes).toBe(0);
    expect(shop.items).toContainEqual(
      expect.objectContaining({ id: packageItem.id, amountMinor: 11_900, currency: 'EUR' }),
    );
    const checkoutKey = randomUUID();
    const checkout = await expectStatus(
      call('POST', '/v1/checkout', {
        token: pupil,
        body: { priceItemId: packageItem.id },
        headers: { 'Idempotency-Key': checkoutKey },
      }),
      StatusCodes.CREATED,
      checkoutBody,
    );
    const checkoutAgain = await expectStatus(
      call('POST', '/v1/checkout', {
        token: pupil,
        body: { priceItemId: packageItem.id },
        headers: { 'Idempotency-Key': checkoutKey },
      }),
      StatusCodes.CREATED,
      checkoutBody,
    );
    expect(checkoutAgain.paymentId).toBe(checkout.paymentId);
    const providerRef = new URL(checkout.checkoutUrl).pathname.split('/').at(-1) ?? '';
    const payPage = await call('GET', `/fake-pay/${providerRef}`);
    expect(payPage.status).toBe(StatusCodes.OK);
    const paid = await call('POST', `/fake-pay/${providerRef}/succeed`);
    expect(paid.status, paid.text).toBe(StatusCodes.OK);
    expect(paid.text).toContain(String(StatusCodes.OK));

    const balanceOf = async () =>
      (
        await expectStatus(
          call('GET', `/v1/students/${studentId}/balance`, { token: pupil }),
          StatusCodes.OK,
          balanceBody,
        )
      ).balanceMinutes;
    await until('the purchased minutes', async () => (await balanceOf()) === 120);
    const invoices = await expectStatus(
      call('GET', `/v1/invoices?studentId=${studentId}`, { token: owner }),
      StatusCodes.OK,
      listBody,
    );
    expect(invoices.items).toEqual([
      expect.objectContaining({
        kind: 'invoice',
        status: 'paid',
        paymentId: checkout.paymentId,
        totalMinor: 11_900,
        currency: 'EUR',
        issuedAt: expect.any(String),
      }),
    ]);

    const firstMinute = Math.ceil((Date.now() + 5_000) / 60_000) * 60_000;
    const start = new Date(firstMinute).toISOString();
    const bookingKey = randomUUID();
    const booking = {
      studentId,
      instructorMembershipId,
      lessonTypeId: lessonType.id,
      vehicleId: vehicle.id,
      start,
    };
    const lesson = await expectStatus(
      call('POST', '/v1/lessons', {
        token: pupil,
        body: booking,
        headers: { 'Idempotency-Key': bookingKey },
      }),
      StatusCodes.CREATED,
      lessonBody,
    );
    expect(lesson).toMatchObject({ status: 'booked', bookedVia: 'student', version: 1, start });
    const replayed = await expectStatus(
      call('POST', '/v1/lessons', {
        token: pupil,
        body: booking,
        headers: { 'Idempotency-Key': bookingKey },
      }),
      StatusCodes.CREATED,
      lessonBody,
    );
    expect(replayed.id).toBe(lesson.id);
    expect(await balanceOf()).toBe(60);
    const window = `from=${encodeURIComponent(new Date(firstMinute - HOUR).toISOString())}&to=${encodeURIComponent(new Date(firstMinute + 2 * HOUR).toISOString())}`;
    const calendar = await expectStatus(
      call('GET', `/v1/calendar?${window}&instructorId=${instructorMembershipId}`, {
        token: owner,
      }),
      StatusCodes.OK,
      listBody,
    );
    expect(calendar.items).toEqual([expect.objectContaining({ id: lesson.id, status: 'booked' })]);

    const ownInvoices = await expectStatus(
      call('GET', '/v1/invoices', { token: pupil }),
      StatusCodes.OK,
      listBody,
    );
    expect(ownInvoices.items.map((i) => i.paymentId)).toEqual([checkout.paymentId]);

    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, firstMinute - Date.now() + 250)),
    );
    const clientAt = new Date().toISOString();
    const ops = [
      {
        opId: newId(),
        clientAt,
        type: 'lesson.complete',
        baseVersion: lesson.version,
        payload: { lessonId: lesson.id },
      },
      {
        opId: newId(),
        clientAt,
        type: 'progress.upsert',
        baseVersion: null,
        payload: {
          progressEntryId: newId(),
          lessonId: lesson.id,
          syllabusItemId,
          level: 3,
          note: 'Smooth starts, check mirrors earlier',
        },
      },
    ];
    const pushed = await expectStatus(
      call('POST', '/v1/sync', { token: instructor, body: { ops } }),
      StatusCodes.OK,
      syncBody,
    );
    expect(pushed.results.map((r) => r.status)).toEqual(['applied', 'applied']);
    expect(pushed.results[0]).toMatchObject({ id: lesson.id, version: 2, error: null });
    const again = await expectStatus(
      call('POST', '/v1/sync', { token: instructor, body: { ops } }),
      StatusCodes.OK,
      syncBody,
    );
    expect(again).toEqual(pushed);
    const completed = await system.query<{ status: string; version: number }>(
      'select status, version from lessons where school_id = $1',
      [schoolId],
    );
    expect(completed.rows).toEqual([{ status: 'completed', version: 2 }]);
    const completions = await system.query<{ count: number }>(
      `select count(*)::int as count from outbox where school_id = $1 and type = 'LessonCompleted'`,
      [schoolId],
    );
    expect(completions.rows[0]?.count).toBe(1);
    expect(await balanceOf()).toBe(60);

    const progress = await expectStatus(
      call('GET', `/v1/students/${studentId}/progress`, { token: pupil }),
      StatusCodes.OK,
      progressBody,
    );
    expect(progress.syllabus).toEqual([
      expect.objectContaining({ syllabusItemId, level: 3, lessonCount: 1 }),
    ]);
    expect(progress.entries).toEqual([
      expect.objectContaining({ lessonId: lesson.id, syllabusItemId, level: 3 }),
    ]);
    const guardianInvoices = await expectStatus(
      call('GET', `/v1/invoices?studentId=${studentId}`, { token: guardian }),
      StatusCodes.OK,
      listBody,
    );
    expect(guardianInvoices.items).toHaveLength(1);

    await until('the payment and the completed lesson in the daily metrics', async () => {
      const { rows } = await system.query<{ revenue: string; lessons: number }>(
        `select sum(revenue_in_app_minor)::text as revenue, sum(lessons_completed)::int as lessons
             from rm_school_metrics_daily where school_id = $1 and to_char(day, 'YYYY-MM') = $2`,
        [schoolId, month],
      );
      return rows[0]?.revenue === '11900' && rows[0]?.lessons === 1;
    });
    const [year, monthIndex] = month.split('-').map(Number) as [number, number];
    const nextMonthNoon = new Date(Date.UTC(year, monthIndex, 1, 12) - offsetHours * HOUR);
    const summary = await worker.app.get(GrowthReportJob).run(nextMonthNoon);
    expect(summary).toMatchObject({ schools: 1, succeeded: 1, failed: [] });
    const report = await expectStatus(
      call('GET', `/v1/reports/growth?month=${month}`, { token: owner }),
      StatusCodes.OK,
      looseBody,
    );
    expect(report).toMatchObject({
      month,
      currency: 'EUR',
      revenueInAppMinor: 11_900,
      noShowRateBp: 0,
      lateCancellationsKept: 0,
    });
  }, 120_000);
});
