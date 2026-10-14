import { randomUUID } from 'node:crypto';
import {
  AvailabilityChanged,
  CashPaymentRecorded,
  type EventDefinition,
  LessonBooked,
  LessonCancelled,
  LessonCompleted,
  LessonMarkedNoShow,
  LessonMoved,
  PaymentSucceeded,
  RefundIssued,
  SlotOfferAccepted,
  SlotOfferCreated,
  SlotOfferExpired,
  TestAttemptRecorded,
  TimeOffAdded,
} from '@driveos/shared';
import type pg from 'pg';
import type { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../src/kernel/cqrs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { rmSchoolMetricsDaily } from '../../src/modules/reporting/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const PROJECTION = 'reporting.school-metrics';

interface DayRow {
  day: string;
  currency: string;
  revenue_in_app_minor: number;
  revenue_recorded_minor: number;
  refunds_minor: number;
  lessons_completed: number;
  lessons_due: number;
  late_cancellations: number;
  late_cancel_minutes_kept: number;
  no_shows: number;
  upsells_sold: number;
  upsell_revenue_minor: number;
  package_minutes_sold: number;
  slots_offered: number;
  slots_filled: number;
  slot_fill_minutes: number;
  instructor_minutes_available: number;
  instructor_minutes_booked: number;
}

const ZERO: Omit<DayRow, 'day' | 'currency'> = {
  revenue_in_app_minor: 0,
  revenue_recorded_minor: 0,
  refunds_minor: 0,
  lessons_completed: 0,
  lessons_due: 0,
  late_cancellations: 0,
  late_cancel_minutes_kept: 0,
  no_shows: 0,
  upsells_sold: 0,
  upsell_revenue_minor: 0,
  package_minutes_sold: 0,
  slots_offered: 0,
  slots_filled: 0,
  slot_fill_minutes: 0,
  instructor_minutes_available: 0,
  instructor_minutes_booked: 0,
};

describe('rm_school_metrics_daily projection (reporting.school-metrics)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    tenants = await createTestTenants(db, { context: worker.tenant });
    ({ A, B } = tenants);
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await tenants?.close();
    await system?.end();
    await db?.drop();
  });

  function event<D extends EventDefinition>(
    definition: D,
    aggregate: { type: string; id: string; version: number },
    payload: z.input<D['schema']>,
    options: { occurredAt?: string; school?: TestTenant } = {},
  ): DomainEvent {
    return {
      id: randomUUID(),
      type: definition.type,
      version: definition.version,
      schoolId: (options.school ?? A).schoolId,
      aggregateType: aggregate.type,
      aggregateId: aggregate.id,
      aggregateVersion: aggregate.version,
      actorUserId: null,
      occurredAt: new Date(options.occurredAt ?? '2026-01-01T12:00:00Z'),
      payload,
    };
  }

  const handler = () => worker.app.get(SubscriberRegistry).get(PROJECTION).handler;

  const project = async (...events: DomainEvent[]) => {
    for (const e of events) {
      const schoolId = e.schoolId as string;
      await worker.tenant.runInTenant({ schoolId, userId: null }, () =>
        handler().handle(e, { subscriber: PROJECTION, attempt: 1 }),
      );
    }
  };

  const day = async (date: string, school: TestTenant = A): Promise<DayRow | undefined> => {
    const { rows } = await system.query<DayRow>(
      `select day::text, currency, revenue_in_app_minor::int, revenue_recorded_minor::int,
              refunds_minor::int, lessons_completed, lessons_due, late_cancellations,
              late_cancel_minutes_kept, no_shows, upsells_sold, upsell_revenue_minor::int,
              package_minutes_sold, slots_offered, slots_filled, slot_fill_minutes,
              instructor_minutes_available, instructor_minutes_booked
         from rm_school_metrics_daily where school_id = $1 and day = $2`,
      [school.schoolId, date],
    );
    return rows[0];
  };

  const expectDay = async (
    date: string,
    counts: Partial<DayRow>,
    school: TestTenant = A,
  ): Promise<void> => {
    expect(await day(date, school)).toEqual({ day: date, currency: 'EUR', ...ZERO, ...counts });
  };

  const ids = () => ({
    lessonId: randomUUID(),
    studentId: randomUUID(),
    instructorMembershipId: randomUUID(),
    lessonTypeId: randomUUID(),
  });

  const purchase = (amountMinor: number, extra: Record<string, unknown> = {}) => ({
    paymentId: randomUUID(),
    studentId: randomUUID(),
    payerUserId: null,
    amountMinor,
    currency: 'EUR',
    priceItemId: randomUUID(),
    priceItemKind: 'lesson' as const,
    invoiceId: randomUUID(),
    ...extra,
  });

  const payment = (amountMinor: number, occurredAt: string, extra: Record<string, unknown> = {}) =>
    event(
      PaymentSucceeded,
      { type: 'payment', id: randomUUID(), version: 2 },
      { ...purchase(amountMinor), method: 'in_app', ...extra },
      { occurredAt },
    );

  const cash = (amountMinor: number, occurredAt: string, extra: Record<string, unknown> = {}) =>
    event(
      CashPaymentRecorded,
      { type: 'payment', id: randomUUID(), version: 1 },
      { ...purchase(amountMinor), method: 'cash', recordedByMembershipId: randomUUID(), ...extra },
      { occurredAt },
    );

  const refund = (amountMinor: number, method: 'in_app' | 'cash', occurredAt: string) =>
    event(
      RefundIssued,
      { type: 'refund', id: randomUUID(), version: 1 },
      {
        refundId: randomUUID(),
        paymentId: randomUUID(),
        studentId: randomUUID(),
        amountMinor,
        currency: 'EUR',
        minutesRemoved: 0,
        creditNoteId: randomUUID(),
        method,
      },
      { occurredAt },
    );

  describe('revenue (cash basis, school time zone)', () => {
    it('revenue_in_app = succeeded in-app payments − in-app refunds; recorded adds cash/bank', async () => {
      await project(
        payment(30_000, '2026-02-10T09:00:00Z'),
        cash(10_000, '2026-02-10T10:00:00Z', { method: 'bank_transfer' }),
        refund(5_000, 'in_app', '2026-02-10T11:00:00Z'),
        refund(2_000, 'cash', '2026-02-10T12:00:00Z'),
      );
      await expectDay('2026-02-10', {
        revenue_in_app_minor: 25_000,
        revenue_recorded_minor: 33_000,
        refunds_minor: 7_000,
      });
    });

    it('books a payment at 23:30 local on the last day of the month on that day', async () => {
      await project(
        payment(12_300, '2026-10-31T22:30:00Z'),
        payment(4_500, '2026-10-31T23:30:00Z'),
      );
      await expectDay('2026-10-31', {
        revenue_in_app_minor: 12_300,
        revenue_recorded_minor: 12_300,
      });
      await expectDay('2026-11-01', { revenue_in_app_minor: 4_500, revenue_recorded_minor: 4_500 });
    });

    it('upsells_sold / upsell_revenue_minor count payments for upsell price items', async () => {
      await project(
        payment(1_500, '2026-02-11T09:00:00Z', { priceItemKind: 'upsell' }),
        cash(2_000, '2026-02-11T10:00:00Z', { priceItemKind: 'upsell' }),
        payment(9_000, '2026-02-11T11:00:00Z', { priceItemKind: 'fee' }),
      );
      await expectDay('2026-02-11', {
        revenue_in_app_minor: 10_500,
        revenue_recorded_minor: 12_500,
        upsells_sold: 2,
        upsell_revenue_minor: 3_500,
      });
    });

    it('package_minutes_sold sums the credit minutes of package purchases', async () => {
      await project(
        payment(45_000, '2026-02-12T09:00:00Z', { priceItemKind: 'package', creditMinutes: 450 }),
        cash(9_000, '2026-02-12T10:00:00Z', { priceItemKind: 'package', creditMinutes: 90 }),
        payment(5_000, '2026-02-12T11:00:00Z', { priceItemKind: 'lesson', creditMinutes: 45 }),
      );
      await expectDay('2026-02-12', {
        revenue_in_app_minor: 50_000,
        revenue_recorded_minor: 59_000,
        package_minutes_sold: 540,
      });
    });
  });

  describe('lessons (bucketed by the local day of the lesson start)', () => {
    const lessonEvents = (start: string, end: string) => {
      const lesson = { ...ids(), creditMinutes: 45, start, end };
      const aggregate = (version: number) => ({ type: 'lesson', id: lesson.lessonId, version });
      return {
        lesson,
        booked: event(LessonBooked, aggregate(1), {
          ...lesson,
          vehicleId: null,
          bookedVia: 'office',
          bookedByMembershipId: randomUUID(),
        }),
        completed: event(LessonCompleted, aggregate(2), lesson),
        noShow: event(LessonMarkedNoShow, aggregate(2), {
          ...lesson,
          markedByMembershipId: randomUUID(),
        }),
        cancelled: (late: boolean, minutesRestored: number, version = 2) =>
          event(LessonCancelled, aggregate(version), {
            ...lesson,
            vehicleId: null,
            late,
            byRole: 'student',
            minutesRestored,
            cancelledByMembershipId: randomUUID(),
          }),
        moved: (to: { start: string; end: string }, lateCancellation: boolean, version = 2) =>
          event(LessonMoved, aggregate(version), {
            ...lesson,
            ...to,
            vehicleId: null,
            previousStart: start,
            previousEnd: end,
            previousInstructorMembershipId: lesson.instructorMembershipId,
            previousVehicleId: null,
            creditMinutesDelta: lateCancellation ? 45 : 0,
            lateCancellation,
            movedByMembershipId: randomUUID(),
          }),
      };
    };

    it('instructor_minutes_booked adds booked lessons on their local day', async () => {
      const a = lessonEvents('2026-03-02T22:30:00Z', '2026-03-02T23:30:00Z');
      const b = lessonEvents('2026-03-03T08:00:00Z', '2026-03-03T09:30:00Z');
      await project(a.booked, b.booked);
      await expectDay('2026-03-02', { instructor_minutes_booked: 60 });
      await expectDay('2026-03-03', { instructor_minutes_booked: 90 });
    });

    it('lessons_completed and lessons_due count completed lessons', async () => {
      const a = lessonEvents('2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z');
      await project(a.booked, a.completed);
      await expectDay('2026-03-04', {
        instructor_minutes_booked: 60,
        lessons_completed: 1,
        lessons_due: 1,
      });
    });

    it('no_shows and lessons_due count no-shows', async () => {
      const a = lessonEvents('2026-03-05T08:00:00Z', '2026-03-05T09:00:00Z');
      const b = lessonEvents('2026-03-05T10:00:00Z', '2026-03-05T11:00:00Z');
      await project(a.booked, a.noShow, b.booked, b.completed);
      await expectDay('2026-03-05', {
        instructor_minutes_booked: 120,
        lessons_completed: 1,
        no_shows: 1,
        lessons_due: 2,
      });
    });

    it('late_cancellations / late_cancel_minutes_kept count late cancellations whose credit was kept', async () => {
      const kept = lessonEvents('2026-03-06T08:00:00Z', '2026-03-06T09:00:00Z');
      const overridden = lessonEvents('2026-03-06T10:00:00Z', '2026-03-06T11:00:00Z');
      const early = lessonEvents('2026-03-06T12:00:00Z', '2026-03-06T13:00:00Z');
      await project(
        kept.booked,
        kept.cancelled(true, 0),
        overridden.booked,
        overridden.cancelled(true, 45),
        early.booked,
        early.cancelled(false, 45),
      );
      await expectDay('2026-03-06', { late_cancellations: 1, late_cancel_minutes_kept: 45 });
    });

    it('a move shifts the booked minutes between days; a late move counts as a kept late cancellation', async () => {
      const plain = lessonEvents('2026-03-09T08:00:00Z', '2026-03-09T09:00:00Z');
      const late = lessonEvents('2026-03-09T10:00:00Z', '2026-03-09T11:00:00Z');
      await project(
        plain.booked,
        plain.moved({ start: '2026-03-10T08:00:00Z', end: '2026-03-10T09:30:00Z' }, false),
        late.booked,
        late.moved({ start: '2026-03-10T10:00:00Z', end: '2026-03-10T11:00:00Z' }, true),
      );
      await expectDay('2026-03-09', { late_cancellations: 1, late_cancel_minutes_kept: 45 });
      await expectDay('2026-03-10', { instructor_minutes_booked: 150 });
    });

    it('ignores a stale lesson event that arrives after a newer one', async () => {
      const a = lessonEvents('2026-03-11T08:00:00Z', '2026-03-11T09:00:00Z');
      await project(a.cancelled(true, 0), a.booked);
      await expectDay('2026-03-11', { late_cancellations: 1, late_cancel_minutes_kept: 45 });
    });
  });

  describe('slot offers (bucketed by the local day of the slot)', () => {
    it('slots_offered counts offers; slots_filled / slot_fill_minutes count accepted ones', async () => {
      const offer = (start: string) => {
        const id = randomUUID();
        const common = {
          offerId: id,
          instructorMembershipId: randomUUID(),
          source: 'cancellation' as const,
          start,
          end: '2026-04-01T11:00:00Z',
        };
        return {
          created: event(
            SlotOfferCreated,
            { type: 'slot_offer', id, version: 1 },
            {
              ...common,
              vehicleId: null,
              lessonTypeId: randomUUID(),
              creditMinutes: 90,
              offeredToStudentIds: [randomUUID()],
              expiresAt: '2026-04-01T08:00:00Z',
            },
          ),
          accepted: event(
            SlotOfferAccepted,
            { type: 'slot_offer', id, version: 2 },
            { ...common, lessonId: randomUUID(), studentId: randomUUID(), creditMinutes: 90 },
          ),
          expired: event(
            SlotOfferExpired,
            { type: 'slot_offer', id, version: 2 },
            { ...common, offeredToStudentIds: [], expiredAt: '2026-04-01T08:00:00Z' },
          ),
        };
      };
      const filled = offer('2026-04-01T09:30:00Z');
      const lapsed = offer('2026-04-01T12:00:00Z');
      const acceptedFirst = offer('2026-04-01T14:00:00Z');
      await project(
        filled.created,
        filled.accepted,
        lapsed.created,
        lapsed.expired,
        acceptedFirst.accepted,
        acceptedFirst.created,
      );
      await expectDay('2026-04-01', { slots_offered: 3, slots_filled: 2, slot_fill_minutes: 180 });
    });
  });

  describe('pass rate', () => {
    it('counts attempts and passes per local day and kind', async () => {
      const attempt = (kind: 'theory' | 'practical', result: 'passed' | 'failed') =>
        event(
          TestAttemptRecorded,
          { type: 'test_attempt', id: randomUUID(), version: 1 },
          {
            testAttemptId: randomUUID(),
            studentId: randomUUID(),
            kind,
            takenOn: '2026-04-02',
            result,
          },
        );
      await project(
        attempt('theory', 'passed'),
        attempt('theory', 'failed'),
        attempt('theory', 'passed'),
        attempt('practical', 'failed'),
      );
      const { rows } = await system.query(
        `select kind, attempts, passed from rm_test_attempts_daily
          where school_id = $1 and day = '2026-04-02' order by kind`,
        [A.schoolId],
      );
      expect(rows).toEqual([
        { kind: 'practical', attempts: 1, passed: 0 },
        { kind: 'theory', attempts: 3, passed: 2 },
      ]);
    });
  });

  describe('availability', () => {
    it('keeps each availability change and time off for the utilisation report', async () => {
      const instructor = randomUUID();
      const timeOffId = randomUUID();
      await project(
        event(
          AvailabilityChanged,
          { type: 'availability', id: instructor, version: 1 },
          {
            instructorMembershipId: instructor,
            effectiveFrom: '2026-01-01',
            windows: [{ weekday: 1, startTime: '09:00', endTime: '17:00' }],
          },
        ),
        event(
          AvailabilityChanged,
          { type: 'availability', id: instructor, version: 2 },
          {
            instructorMembershipId: instructor,
            effectiveFrom: '2026-05-01',
            effectiveTo: '2026-05-31',
            windows: [],
          },
        ),
        event(
          TimeOffAdded,
          { type: 'time_off', id: timeOffId, version: 1 },
          {
            timeOffId,
            instructorMembershipId: instructor,
            start: '2026-04-06T07:00:00Z',
            end: '2026-04-06T09:00:00Z',
          },
        ),
      );
      const layers = await system.query(
        `select version, effective_from::text, effective_to::text, windows
           from rm_instructor_availability where instructor_membership_id = $1 order by version`,
        [instructor],
      );
      expect(layers.rows).toEqual([
        {
          version: 1,
          effective_from: '2026-01-01',
          effective_to: null,
          windows: [{ weekday: 1, startTime: '09:00', endTime: '17:00' }],
        },
        { version: 2, effective_from: '2026-05-01', effective_to: '2026-05-31', windows: [] },
      ]);
      const off = await system.query(
        `select time_off_id, start_at, end_at from rm_instructor_time_off where school_id = $1`,
        [A.schoolId],
      );
      expect(off.rows).toEqual([
        {
          time_off_id: timeOffId,
          start_at: new Date('2026-04-06T07:00:00Z'),
          end_at: new Date('2026-04-06T09:00:00Z'),
        },
      ]);
    });
  });

  describe('idempotency and isolation', () => {
    it('replaying the same events does not double count', async () => {
      const lesson = { ...ids(), creditMinutes: 45 };
      const stream = [
        payment(30_000, '2026-06-01T09:00:00Z', { priceItemKind: 'upsell' }),
        cash(10_000, '2026-06-01T10:00:00Z', { priceItemKind: 'package', creditMinutes: 90 }),
        refund(5_000, 'in_app', '2026-06-01T11:00:00Z'),
        event(
          LessonBooked,
          { type: 'lesson', id: lesson.lessonId, version: 1 },
          {
            ...lesson,
            start: '2026-06-01T08:00:00Z',
            end: '2026-06-01T09:00:00Z',
            vehicleId: null,
            bookedVia: 'office',
            bookedByMembershipId: randomUUID(),
          },
        ),
        event(
          LessonMarkedNoShow,
          { type: 'lesson', id: lesson.lessonId, version: 2 },
          {
            ...lesson,
            start: '2026-06-01T08:00:00Z',
            end: '2026-06-01T09:00:00Z',
            markedByMembershipId: randomUUID(),
          },
        ),
        event(
          TestAttemptRecorded,
          { type: 'test_attempt', id: randomUUID(), version: 1 },
          {
            testAttemptId: randomUUID(),
            studentId: randomUUID(),
            kind: 'theory',
            takenOn: '2026-06-01',
            result: 'passed',
          },
        ),
      ];
      const expected = {
        revenue_in_app_minor: 25_000,
        revenue_recorded_minor: 35_000,
        refunds_minor: 5_000,
        upsells_sold: 1,
        upsell_revenue_minor: 30_000,
        package_minutes_sold: 90,
        instructor_minutes_booked: 60,
        no_shows: 1,
        lessons_due: 1,
      };
      await project(...stream);
      await expectDay('2026-06-01', expected);
      await project(...stream);
      await project(...stream.reverse());
      await expectDay('2026-06-01', expected);
      const { rows } = await system.query(
        `select attempts, passed from rm_test_attempts_daily where school_id = $1 and day = '2026-06-01'`,
        [A.schoolId],
      );
      expect(rows).toEqual([{ attempts: 1, passed: 1 }]);
    });

    it('keeps two schools apart, each in its own zone', async () => {
      await project(
        event(
          PaymentSucceeded,
          { type: 'payment', id: randomUUID(), version: 2 },
          { ...purchase(7_000), method: 'in_app' },
          { occurredAt: '2026-07-01T22:30:00Z', school: B },
        ),
      );
      await expectDay(
        '2026-07-01',
        { revenue_in_app_minor: 7_000, revenue_recorded_minor: 7_000 },
        B,
      );
      expect(await day('2026-07-01', A)).toBeUndefined();
      expect(await day('2026-07-02', A)).toBeUndefined();
      const visibleToA = await tenants.asSchool(A, (tx) => tx.select().from(rmSchoolMetricsDaily));
      expect(visibleToA.every((row) => row.schoolId === A.schoolId)).toBe(true);
      const visibleToB = await tenants.asSchool(B, (tx) => tx.select().from(rmSchoolMetricsDaily));
      expect(visibleToB.map((row) => row.day)).toEqual(['2026-07-01']);
    });
  });
});
