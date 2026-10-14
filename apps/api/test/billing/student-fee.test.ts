import { randomUUID } from 'node:crypto';
import {
  type EventDefinition,
  PlatformChargeCreated,
  StudentArchived,
  StudentEnrolled,
} from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DomainEvent, newEvent } from '../../src/kernel/cqrs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { StudentFeeReversalSubscriber } from '../../src/modules/billing/subscribers/student-archived.subscriber.js';
import { StudentFeeSubscriber } from '../../src/modules/billing/subscribers/student-enrolled.subscriber.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { chargesOf, insertPlan, subscribe } from './platform-billing-support.js';

const DAY_MS = 86_400_000;

describe('platform billing subscribers', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let standardPlan: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    standardPlan = await insertPlan(system, { baseAmountMinor: 4900, studentFeeMinor: 300 });
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  async function subscribedSchool(planId = standardPlan): Promise<SchoolFixture> {
    const school = await createSchoolFixture(system);
    await subscribe(system, school.schoolId, planId, '2026-01-01T00:00:00Z');
    return school;
  }

  async function publish<D extends EventDefinition>(
    school: SchoolFixture,
    definition: D,
    payload: DomainEvent['payload'],
    occurredAt = new Date('2026-09-10T09:00:00Z'),
  ) {
    await worker.tenant.runInTenant({ schoolId: school.schoolId, userId: null }, () =>
      worker.publisher.append([
        newEvent(definition, {
          aggregateType: 'student',
          aggregateId: (payload as { studentId: string }).studentId,
          aggregateVersion: 1,
          payload: payload as never,
          occurredAt,
        }),
      ]),
    );
  }

  const enrolled = (studentId: string, firstEnrolment = true) => ({
    studentId,
    enrolmentId: randomUUID(),
    courseName: 'Class B',
    licenceClass: 'B',
    firstEnrolment,
    startedAt: '2026-09-10T00:00:00.000Z',
  });

  const archived = (studentId: string, archivedAt: Date, completedLessons = 0) => ({
    studentId,
    archivedAt: archivedAt.toISOString(),
    completedLessons,
  });

  const chargeEvents = (school: SchoolFixture) =>
    expectEvents(db, { type: PlatformChargeCreated, schoolId: school.schoolId });

  async function enrol(school: SchoolFixture, studentId: string, firstEnrolment = true) {
    await publish(school, StudentEnrolled, enrolled(studentId, firstEnrolment));
    await worker.drainWorker();
  }

  async function redeliver(
    subscriber: { handle(event: DomainEvent<never>): Promise<void> },
    event: DomainEvent | undefined,
  ) {
    if (!event) throw new Error('event not found');
    await worker.tenant.runInTenant({ schoolId: event.schoolId, userId: null }, () =>
      subscriber.handle(event as DomainEvent<never>),
    );
  }

  it('registers the billing subscribers in the worker', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toEqual(
      expect.arrayContaining(['billing.student-fee', 'billing.student-fee-reversal']),
    );
  });

  describe('StudentEnrolled → student fee', () => {
    it("charges the school once, at the plan's fee, for the month of the enrolment", async () => {
      const school = await subscribedSchool();
      const [studentId] = school.studentIds;

      await enrol(school, studentId);

      const charges = await chargesOf(system, school.schoolId);
      expect(charges).toEqual([
        {
          id: expect.any(String),
          kind: 'student_fee',
          student_id: studentId,
          period_month: '2026-09-01',
          amount_minor: 300,
          currency: 'EUR',
          status: 'pending',
          statement_id: null,
        },
      ]);
      const events = await chargeEvents(school);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        aggregateType: 'platform_charge',
        aggregateId: charges[0]?.id,
        aggregateVersion: 1,
        payload: {
          chargeId: charges[0]?.id,
          schoolId: school.schoolId,
          kind: 'student_fee',
          studentId,
          periodMonth: '2026-09',
          amountMinor: 300,
          currency: 'EUR',
        },
      });
    });

    it('charges a student once across re-enrolments and extra courses', async () => {
      const school = await subscribedSchool();
      const [studentId] = school.studentIds;

      await enrol(school, studentId);
      await enrol(school, studentId, false);
      await enrol(school, studentId, false);

      expect(await chargesOf(system, school.schoolId)).toHaveLength(1);
      expect(await chargeEvents(school)).toHaveLength(1);
    });

    it('is idempotent when the same event is delivered again', async () => {
      const school = await subscribedSchool();
      const [studentId] = school.studentIds;
      await enrol(school, studentId);
      const [event] = await expectEvents(db, { type: StudentEnrolled, schoolId: school.schoolId });

      await redeliver(worker.app.get(StudentFeeSubscriber), event);

      expect(await chargesOf(system, school.schoolId)).toHaveLength(1);
      expect(await chargeEvents(school)).toHaveLength(1);
    });

    it('takes the fee from the plan at the time of the charge', async () => {
      const school = await subscribedSchool();
      const [first, second] = school.studentIds;
      await enrol(school, first);

      const pricier = await insertPlan(system, { baseAmountMinor: 4900, studentFeeMinor: 450 });
      await system.query(`update subscriptions set plan_id = $2 where school_id = $1`, [
        school.schoolId,
        pricier,
      ]);
      await enrol(school, second);

      const charges = await chargesOf(system, school.schoolId);
      expect(charges.map((c) => [c.student_id, c.amount_minor])).toEqual([
        [first, 300],
        [second, 450],
      ]);
    });

    it('records a 0 fee when the plan has no student fee, so it stays measurable', async () => {
      const free = await insertPlan(system, { baseAmountMinor: 0, studentFeeMinor: 0 });
      const school = await subscribedSchool(free);

      await enrol(school, school.studentIds[0]);

      const charges = await chargesOf(system, school.schoolId);
      expect(charges.map((c) => [c.kind, c.amount_minor])).toEqual([['student_fee', 0]]);
      expect(await chargeEvents(school)).toHaveLength(1);
    });

    it('charges nothing for a school without a current subscription', async () => {
      const school = await createSchoolFixture(system);

      await enrol(school, school.studentIds[0]);

      expect(await chargesOf(system, school.schoolId)).toEqual([]);
      expect(await chargeEvents(school)).toEqual([]);
    });
  });

  describe('StudentArchived → student fee reversal', () => {
    async function chargedStudent() {
      const school = await subscribedSchool();
      const [studentId] = school.studentIds;
      await enrol(school, studentId);
      const [fee] = await chargesOf(system, school.schoolId);
      const { rows } = await system.query<{ created_at: Date }>(
        `select created_at from platform_charges where id = $1`,
        [fee?.id],
      );
      return { school, studentId, chargedAt: rows[0]?.created_at as Date };
    }

    async function archive(school: SchoolFixture, studentId: string, at: Date, completed = 0) {
      await publish(school, StudentArchived, archived(studentId, at, completed), at);
      await worker.drainWorker();
    }

    it('reverses the fee when the student is archived within 14 days without completed lessons', async () => {
      const { school, studentId, chargedAt } = await chargedStudent();
      const archivedAt = new Date(chargedAt.getTime() + 13 * DAY_MS);

      await archive(school, studentId, archivedAt);

      const charges = await chargesOf(system, school.schoolId);
      const reversal = charges.find((c) => c.kind === 'student_fee_reversal');
      expect(reversal).toEqual({
        id: expect.any(String),
        kind: 'student_fee_reversal',
        student_id: studentId,
        period_month: `${archivedAt.toISOString().slice(0, 7)}-01`,
        amount_minor: -300,
        currency: 'EUR',
        status: 'pending',
        statement_id: null,
      });
      const events = await chargeEvents(school);
      expect(events.map((e) => [e.payload.kind, e.payload.amountMinor])).toEqual([
        ['student_fee', 300],
        ['student_fee_reversal', -300],
      ]);
      expect(events[1]?.aggregateId).toBe(reversal?.id);
    });

    it('does not reverse after 14 days', async () => {
      const { school, studentId, chargedAt } = await chargedStudent();

      await archive(school, studentId, new Date(chargedAt.getTime() + 15 * DAY_MS));

      expect((await chargesOf(system, school.schoolId)).map((c) => c.kind)).toEqual([
        'student_fee',
      ]);
      expect(await chargeEvents(school)).toHaveLength(1);
    });

    it('does not reverse when the student completed a lesson', async () => {
      const { school, studentId, chargedAt } = await chargedStudent();

      await archive(school, studentId, new Date(chargedAt.getTime() + DAY_MS), 1);

      expect((await chargesOf(system, school.schoolId)).map((c) => c.kind)).toEqual([
        'student_fee',
      ]);
    });

    it('reverses once, even when archived again or the event is delivered again', async () => {
      const { school, studentId, chargedAt } = await chargedStudent();
      await archive(school, studentId, new Date(chargedAt.getTime() + DAY_MS));
      await archive(school, studentId, new Date(chargedAt.getTime() + 2 * DAY_MS));
      const [event] = await expectEvents(db, { type: StudentArchived, schoolId: school.schoolId });

      await redeliver(worker.app.get(StudentFeeReversalSubscriber), event);

      const kinds = (await chargesOf(system, school.schoolId)).map((c) => c.kind);
      expect(kinds).toEqual(['student_fee', 'student_fee_reversal']);
      expect(await chargeEvents(school)).toHaveLength(2);
    });

    it('does nothing for a student who was never charged', async () => {
      const school = await subscribedSchool();

      await archive(school, school.studentIds[1], new Date('2026-09-12T10:00:00Z'));

      expect(await chargesOf(system, school.schoolId)).toEqual([]);
    });
  });
});
