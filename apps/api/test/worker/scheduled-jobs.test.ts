import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobQueues, QUEUES, ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

describe('scheduled jobs', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let harness: WorkerTestHarness;
  let scheduled: ScheduledJobs;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    harness = await createWorkerTestHarness(db);
    scheduled = harness.app.get(ScheduledJobs);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await system?.end();
    await db?.drop();
  });

  it('registers the kernel jobs: hourly reconciler and idempotency purge, relay tick', () => {
    expect(scheduled.list().map(({ name, pattern, every }) => ({ name, pattern, every }))).toEqual([
      { name: 'billing.monthly-statements', pattern: '0 2 1 * *', every: undefined },
      { name: 'kernel.delivery-reconcile', pattern: '0 * * * *', every: undefined },
      { name: 'kernel.idempotency-purge', pattern: '30 * * * *', every: undefined },
      { name: 'kernel.outbox-relay-tick', pattern: undefined, every: 60_000 },
      { name: 'messaging.chat-retention', pattern: '30 3 * * *', every: undefined },
      { name: 'messaging.notification-dispatch', pattern: undefined, every: 30_000 },
      { name: 'platform.alerts', pattern: undefined, every: 60_000 },
      { name: 'reporting.growth-report', pattern: '0 * * * *', every: undefined },
      { name: 'scheduling.slot-offer-expiry', pattern: undefined, every: 60_000 },
      { name: 'scheduling.slot-offer-gap-scan', pattern: '0 2 * * *', every: undefined },
    ]);
  });

  it('creates one BullMQ job scheduler per registered job and removes unknown ones', async () => {
    const queue = harness.app.get(JobQueues).queue(QUEUES.scheduled);
    await queue.upsertJobScheduler('retired.job', { every: 1000 }, { name: 'retired.job' });

    await scheduled.start();
    try {
      const schedulers = await queue.getJobSchedulers();
      expect(
        schedulers
          .map(({ key, pattern, every }) => ({
            key,
            pattern,
            every: every ? Number(every) : undefined,
          }))
          .sort((a, b) => a.key.localeCompare(b.key)),
      ).toEqual([
        { key: 'billing.monthly-statements', pattern: '0 2 1 * *', every: undefined },
        { key: 'kernel.delivery-reconcile', pattern: '0 * * * *', every: undefined },
        { key: 'kernel.idempotency-purge', pattern: '30 * * * *', every: undefined },
        { key: 'kernel.outbox-relay-tick', pattern: undefined, every: 60_000 },
        { key: 'messaging.chat-retention', pattern: '30 3 * * *', every: undefined },
        { key: 'messaging.notification-dispatch', pattern: undefined, every: 30_000 },
        { key: 'platform.alerts', pattern: undefined, every: 60_000 },
        { key: 'reporting.growth-report', pattern: '0 * * * *', every: undefined },
        { key: 'scheduling.slot-offer-expiry', pattern: undefined, every: 60_000 },
        { key: 'scheduling.slot-offer-gap-scan', pattern: '0 2 * * *', every: undefined },
      ]);
    } finally {
      await scheduled.stop();
    }
  });

  it('runs the purge job: idempotency keys older than 24 h are deleted', async () => {
    const old = randomUUID();
    const fresh = randomUUID();
    await system.query(
      `insert into idempotency_keys (school_id, key, endpoint, request_hash, response_status,
        response_body, created_at)
       values ($1, $2, 'POST /v1/ping', 'h', 201, '{}', now() - interval '25 hours'),
              ($1, $3, 'POST /v1/ping', 'h', 201, '{}', now())`,
      [school.schoolId, old, fresh],
    );

    await scheduled.run('kernel.idempotency-purge');

    const left = await system.query<{ key: string }>('select key from idempotency_keys');
    expect(left.rows.map((row) => row.key)).toEqual([fresh]);
  });

  it('processes a due scheduled job through the scheduled queue', async () => {
    const calls: string[] = [];
    scheduled.register({
      name: 'test.every-second',
      every: 200,
      handler: async () => {
        calls.push('ran');
      },
    });
    await scheduled.start();
    try {
      await expect.poll(() => calls.length, { timeout: 5000, interval: 50 }).toBeGreaterThan(0);
    } finally {
      await scheduled.stop();
    }
  });

  it('rejects invalid or duplicate definitions', () => {
    const handler = async () => undefined;
    expect(() =>
      scheduled.register({ name: 'kernel.idempotency-purge', every: 1, handler }),
    ).toThrow(/registered twice/);
    expect(() => scheduled.register({ name: 'bad:name', every: 1, handler })).toThrow(/name/);
    expect(() => scheduled.register({ name: 'no.timing', handler })).toThrow(/pattern or every/);
    expect(() =>
      scheduled.register({ name: 'both.timings', pattern: '* * * * *', every: 1, handler }),
    ).toThrow(/pattern or every/);
  });
});
