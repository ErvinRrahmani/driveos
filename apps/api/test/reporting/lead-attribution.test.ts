import { randomUUID } from 'node:crypto';
import {
  CashPaymentRecorded,
  type EventDefinition,
  LeadCaptured,
  LeadConverted,
  PaymentSucceeded,
  RefundIssued,
} from '@driveos/shared';
import type pg from 'pg';
import type { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../src/kernel/cqrs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const PROJECTION = 'reporting.school-metrics';

interface LeadDay {
  leads_captured: number;
  leads_converted: number;
  lead_revenue_minor: number;
  revenue_recorded_minor: number;
}

describe('lead attribution (reporting.school-metrics)', () => {
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

  const project = async (...events: DomainEvent[]) => {
    const handler = worker.app.get(SubscriberRegistry).get(PROJECTION).handler;
    for (const e of events) {
      await worker.tenant.runInTenant({ schoolId: e.schoolId as string, userId: null }, () =>
        handler.handle(e, { subscriber: PROJECTION, attempt: 1 }),
      );
    }
  };

  const day = async (date: string, school: TestTenant = A): Promise<LeadDay | undefined> => {
    const { rows } = await system.query<LeadDay>(
      `select leads_captured, leads_converted, lead_revenue_minor::int,
              revenue_recorded_minor::int
         from rm_school_metrics_daily where school_id = $1 and day = $2`,
      [school.schoolId, date],
    );
    return rows[0];
  };

  const leadStudents = async (school: TestTenant = A) =>
    (
      await system.query<{ student_id: string; lead_id: string; converted_on: string }>(
        `select student_id, lead_id, converted_on::text
           from rm_lead_students where school_id = $1 order by converted_on`,
        [school.schoolId],
      )
    ).rows;

  const captured = (leadId: string, capturedAt: string, version = 1, school?: TestTenant) =>
    event(
      LeadCaptured,
      { type: 'lead', id: leadId, version },
      {
        leadId,
        source: 'page',
        licenceClass: 'B',
        isMinor: false,
        fullName: 'Lena Lead',
        capturedAt,
      },
      { occurredAt: '2026-01-01T12:00:00Z', ...(school ? { school } : {}) },
    );

  const converted = (leadId: string, studentId: string, convertedAt: string, version = 3) =>
    event(
      LeadConverted,
      { type: 'lead', id: leadId, version },
      { leadId, studentId, convertedAt },
      { occurredAt: '2026-01-01T12:00:00Z' },
    );

  const purchase = (studentId: string, amountMinor: number) => ({
    paymentId: randomUUID(),
    studentId,
    payerUserId: null,
    amountMinor,
    currency: 'EUR',
    priceItemId: randomUUID(),
    priceItemKind: 'lesson' as const,
    invoiceId: randomUUID(),
  });

  const cash = (studentId: string, amountMinor: number, occurredAt: string, school?: TestTenant) =>
    event(
      CashPaymentRecorded,
      { type: 'payment', id: randomUUID(), version: 1 },
      { ...purchase(studentId, amountMinor), method: 'cash', recordedByMembershipId: randomUUID() },
      { occurredAt, ...(school ? { school } : {}) },
    );

  const inApp = (studentId: string, amountMinor: number, occurredAt: string) =>
    event(
      PaymentSucceeded,
      { type: 'payment', id: randomUUID(), version: 2 },
      { ...purchase(studentId, amountMinor), method: 'in_app' },
      { occurredAt },
    );

  const refund = (studentId: string, amountMinor: number, occurredAt: string) =>
    event(
      RefundIssued,
      { type: 'refund', id: randomUUID(), version: 1 },
      {
        refundId: randomUUID(),
        paymentId: randomUUID(),
        studentId,
        amountMinor,
        currency: 'EUR',
        minutesRemoved: 0,
        creditNoteId: randomUUID(),
        method: 'cash',
      },
      { occurredAt },
    );

  const leadId = randomUUID();
  const studentId = randomUUID();

  it('does not count a repeat enquiry (only the lead notifications listen to it)', () => {
    expect(worker.app.get(SubscriberRegistry).subscribersFor('LeadEnquiryRepeated')).toEqual([
      'messaging.lead-notifications',
    ]);
  });

  it('counts a captured lead on the local day of capturedAt', async () => {
    // 22:30 UTC on 4 May is 00:30 on 5 May in Berlin.
    await project(captured(leadId, '2026-05-04T22:30:00.000Z'));
    expect(await day('2026-05-05')).toMatchObject({ leads_captured: 1, leads_converted: 0 });
    expect(await day('2026-05-04')).toBeUndefined();
  });

  it('counts a conversion on the local day of convertedAt and records the lead student', async () => {
    await project(converted(leadId, studentId, '2026-05-06T08:00:00.000Z'));
    expect(await day('2026-05-06')).toMatchObject({ leads_captured: 0, leads_converted: 1 });
    expect(await leadStudents()).toEqual([
      { student_id: studentId, lead_id: leadId, converted_on: '2026-05-06' },
    ]);
  });

  it('attributes payments of a lead student to lead revenue', async () => {
    await project(
      cash(studentId, 5_000, '2026-05-07T09:00:00Z'),
      inApp(studentId, 3_000, '2026-05-07T10:00:00Z'),
    );
    expect(await day('2026-05-07')).toEqual({
      leads_captured: 0,
      leads_converted: 0,
      lead_revenue_minor: 8_000,
      revenue_recorded_minor: 8_000,
    });
  });

  it('leaves lead revenue unchanged for a student who did not come from a lead', async () => {
    await project(cash(randomUUID(), 7_000, '2026-05-08T09:00:00Z'));
    expect(await day('2026-05-08')).toMatchObject({
      lead_revenue_minor: 0,
      revenue_recorded_minor: 7_000,
    });
  });

  it('does not reduce lead revenue on a refund', async () => {
    await project(refund(studentId, 2_000, '2026-05-07T11:00:00Z'));
    expect(await day('2026-05-07')).toMatchObject({
      lead_revenue_minor: 8_000,
      revenue_recorded_minor: 6_000,
    });
  });

  it('ignores a stale lead event (lower aggregate version) for the same lead', async () => {
    await project(
      captured(leadId, '2026-05-09T10:00:00.000Z', 1),
      captured(leadId, '2026-05-09T10:00:00.000Z', 2),
    );
    expect(await day('2026-05-09')).toBeUndefined();
    expect(await day('2026-05-05')).toMatchObject({ leads_captured: 1 });
  });

  it('does not attribute a payment in another school to a lead student of school A', async () => {
    await project(cash(studentId, 4_000, '2026-05-10T09:00:00Z', B));
    expect(await day('2026-05-10', B)).toMatchObject({
      lead_revenue_minor: 0,
      revenue_recorded_minor: 4_000,
    });
    expect(await leadStudents(B)).toEqual([]);
  });
});
