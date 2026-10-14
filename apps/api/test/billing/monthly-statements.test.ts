import { PlatformChargeCreated, PlatformStatementIssued } from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobQueues, QUEUES, ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { previousMonth } from '../../src/modules/billing/domain/platform-fees.js';
import { MonthlyStatementsJob } from '../../src/modules/billing/infra/monthly-statements.job.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import {
  chargesOf,
  insertPlan,
  pendingCharge,
  statementsOf,
  subscribe,
} from './platform-billing-support.js';

describe('monthly platform statements', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let job: MonthlyStatementsJob;
  let standard: string;
  let solo: string;
  let full: SchoolFixture;
  let midMonth: SchoolFixture;
  let soloSchool: SchoolFixture;
  let reversedOnly: SchoolFixture;
  let suspended: SchoolFixture;
  let fullCharges: { september: string; august: string; october: string; reversal: string };

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    job = worker.app.get(MonthlyStatementsJob);
    standard = await insertPlan(system, { baseAmountMinor: 4900, studentFeeMinor: 300 });
    solo = await insertPlan(system, { baseAmountMinor: 0, studentFeeMinor: 300 });

    full = await createSchoolFixture(system);
    await subscribe(system, full.schoolId, standard, '2026-03-14T09:30:00Z');
    const [s1, s2] = full.studentIds;
    fullCharges = {
      august: await pendingCharge(system, full.schoolId, {
        kind: 'student_fee',
        studentId: s1,
        periodMonth: '2026-08-01',
        amountMinor: 300,
      }),
      september: await pendingCharge(system, full.schoolId, {
        kind: 'student_fee',
        studentId: s2,
        periodMonth: '2026-09-01',
        amountMinor: 300,
      }),
      reversal: await pendingCharge(system, full.schoolId, {
        kind: 'student_fee_reversal',
        studentId: s1,
        periodMonth: '2026-09-01',
        amountMinor: -300,
      }),
      october: await pendingCharge(system, full.schoolId, {
        kind: 'base_subscription',
        studentId: null,
        periodMonth: '2026-10-01',
        amountMinor: 999,
      }),
    };

    midMonth = await createSchoolFixture(system);
    await subscribe(system, midMonth.schoolId, standard, '2026-09-16T08:00:00Z');

    soloSchool = await createSchoolFixture(system);
    await subscribe(system, soloSchool.schoolId, solo, '2026-01-01T00:00:00Z');
    await pendingCharge(system, soloSchool.schoolId, {
      kind: 'student_fee',
      studentId: soloSchool.studentIds[0],
      periodMonth: '2026-09-01',
      amountMinor: 300,
    });

    reversedOnly = await createSchoolFixture(system);
    await subscribe(system, reversedOnly.schoolId, solo, '2026-01-01T00:00:00Z');
    await pendingCharge(system, reversedOnly.schoolId, {
      kind: 'student_fee_reversal',
      studentId: reversedOnly.studentIds[0],
      periodMonth: '2026-09-01',
      amountMinor: -300,
    });

    suspended = await createSchoolFixture(system);
    await subscribe(system, suspended.schoolId, standard, '2026-01-01T00:00:00Z');
    await system.query(`update schools set status = 'suspended' where id = $1`, [
      suspended.schoolId,
    ]);

    await job.issueStatements('2026-09');
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  const statementEvents = (school: SchoolFixture) =>
    expectEvents(db, { type: PlatformStatementIssued, schoolId: school.schoolId });

  it('registers the job for 02:00 UTC on the 1st of each month', async () => {
    const scheduled = worker.app.get(ScheduledJobs);
    expect(scheduled.list().find((j) => j.name === 'billing.monthly-statements')).toMatchObject({
      pattern: '0 2 1 * *',
    });
    await scheduled.start();
    try {
      const schedulers = await worker.app.get(JobQueues).queue(QUEUES.scheduled).getJobSchedulers();
      expect(schedulers.find((s) => s.key === 'billing.monthly-statements')).toMatchObject({
        pattern: '0 2 1 * *',
        tz: 'UTC',
      });
    } finally {
      await scheduled.stop();
    }
  });

  it('bills a full month: the plan base plus the pending charges up to that month', async () => {
    const [statement] = await statementsOf(system, full.schoolId);
    expect(statement).toEqual({
      id: expect.any(String),
      month: '2026-09',
      total_minor: 4900 + 300 + 300 - 300,
      currency: 'EUR',
      status: 'issued',
    });
    const charges = await chargesOf(system, full.schoolId);
    const byId = new Map(charges.map((c) => [c.id, c]));
    for (const id of [fullCharges.august, fullCharges.september, fullCharges.reversal]) {
      expect(byId.get(id)).toMatchObject({ status: 'statemented', statement_id: statement?.id });
    }
    expect(byId.get(fullCharges.october)).toMatchObject({ status: 'pending', statement_id: null });
    const base = charges.filter(
      (c) => c.kind === 'base_subscription' && c.id !== fullCharges.october,
    );
    expect(base).toEqual([
      {
        id: expect.any(String),
        kind: 'base_subscription',
        student_id: null,
        period_month: '2026-09-01',
        amount_minor: 4900,
        currency: 'EUR',
        status: 'statemented',
        statement_id: statement?.id,
      },
    ]);
  });

  it('pro-rates the base for a school that started mid-month', async () => {
    const [statement] = await statementsOf(system, midMonth.schoolId);
    expect(statement).toMatchObject({ month: '2026-09', total_minor: 2450 });
    expect((await chargesOf(system, midMonth.schoolId)).map((c) => c.amount_minor)).toEqual([2450]);
  });

  it('charges no base on the solo plan', async () => {
    const [statement] = await statementsOf(system, soloSchool.schoolId);
    expect(statement).toMatchObject({ total_minor: 300 });
    const base = (await chargesOf(system, soloSchool.schoolId)).find(
      (c) => c.kind === 'base_subscription',
    );
    expect(base).toMatchObject({ amount_minor: 0, status: 'statemented' });
  });

  it('never issues a negative total', async () => {
    const [statement] = await statementsOf(system, reversedOnly.schoolId);
    expect(statement).toMatchObject({ total_minor: 0 });
    expect(
      (await chargesOf(system, reversedOnly.schoolId)).every((c) => c.status === 'statemented'),
    ).toBe(true);
  });

  it('announces the statement to the owners and the base charge', async () => {
    const [statement] = await statementsOf(system, full.schoolId);
    const events = await statementEvents(full);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      aggregateType: 'platform_statement',
      aggregateId: statement?.id,
      aggregateVersion: 1,
      actorUserId: null,
      payload: {
        statementId: statement?.id,
        schoolId: full.schoolId,
        month: '2026-09',
        totalMinor: 5200,
        currency: 'EUR',
        ownerUserIds: [full.ownerUserId],
      },
    });
    const charges = await expectEvents(db, {
      type: PlatformChargeCreated,
      schoolId: full.schoolId,
    });
    expect(
      charges.map((e) => [e.payload.kind, e.payload.periodMonth, e.payload.amountMinor]),
    ).toEqual([['base_subscription', '2026-09', 4900]]);
  });

  it('skips suspended schools', async () => {
    expect(await statementsOf(system, suspended.schoolId)).toEqual([]);
    expect(await statementEvents(suspended)).toEqual([]);
  });

  it('issues one statement per school and month when it runs again', async () => {
    const before = await chargesOf(system, full.schoolId);

    const summary = await job.issueStatements('2026-09');

    expect(summary.failed).toEqual([]);
    for (const school of [full, midMonth, soloSchool, reversedOnly]) {
      expect(await statementsOf(system, school.schoolId)).toHaveLength(1);
      expect(await statementEvents(school)).toHaveLength(1);
    }
    expect(await chargesOf(system, full.schoolId)).toEqual(before);
  });

  it('issues nothing for a month before the subscription started', async () => {
    await job.issueStatements('2026-08');

    expect((await statementsOf(system, midMonth.schoolId)).map((s) => s.month)).toEqual([
      '2026-09',
    ]);
  });

  it('runs for the previous month when triggered by the scheduler', async () => {
    const school = await createSchoolFixture(system);
    await subscribe(system, school.schoolId, standard, '2020-01-01T00:00:00Z');

    await worker.app.get(ScheduledJobs).run('billing.monthly-statements');

    expect(await statementsOf(system, school.schoolId)).toMatchObject([
      { month: previousMonth(new Date()), total_minor: 4900 },
    ]);
  });
});
