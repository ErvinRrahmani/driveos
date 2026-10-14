import { randomBytes, randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JobProcessors, JobQueues, QUEUES, ScheduledJobs } from '../src/kernel/jobs/index.js';
import { OutboxRelayLoop } from '../src/kernel/outbox/index.js';
import { EventsWorker } from '../src/kernel/subscribers/index.js';
import { WorkerLifecycle } from '../src/kernel/worker/worker-lifecycle.js';
import { createWorkerApp } from '../src/worker-app.js';
import { createSchoolFixture } from './db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from './db/scratch-database.js';

describe('worker app', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  const prefix = `driveos-test-${randomBytes(6).toString('hex')}`;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    vi.stubEnv('DATABASE_URL', db.appUrl);
    vi.stubEnv('DATABASE_SYSTEM_URL', db.systemUrl);
    vi.stubEnv('JOBS_PREFIX', prefix);
    vi.stubEnv('OUTBOX_POLL_MS', '20');
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await system?.end();
    await db?.drop();
  });

  it('starts the relay loop, events worker and schedulers, relays events and stops cleanly', async () => {
    const school = await createSchoolFixture(system);
    const app = await createWorkerApp({ envFilePath: ['.env.example'] });
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:16379');
    try {
      await app.init();
      expect(app.get(WorkerLifecycle).running).toBe(true);
      expect(app.get(OutboxRelayLoop).running).toBe(true);
      expect(app.get(EventsWorker).running).toBe(true);
      expect(app.get(ScheduledJobs).running).toBe(true);
      expect(app.get(JobProcessors).running).toBe(true);
      expect(app.get(JobProcessors).list()).toEqual([QUEUES.reminders]);
      const schedulers = await app.get(JobQueues).queue(QUEUES.scheduled).getJobSchedulers();
      expect(schedulers.map((s) => s.key).sort()).toEqual([
        'billing.monthly-statements',
        'kernel.delivery-reconcile',
        'kernel.idempotency-purge',
        'kernel.outbox-relay-tick',
        'messaging.chat-retention',
        'messaging.notification-dispatch',
        'platform.alerts',
        'reporting.growth-report',
        'scheduling.slot-offer-expiry',
        'scheduling.slot-offer-gap-scan',
        'training.lead-purge',
      ]);

      const id = randomUUID();
      await system.query(
        `insert into outbox (id, school_id, type, version, aggregate_type, aggregate_id,
          aggregate_version, occurred_at, payload) values ($1, $2, 'PingRecorded', 1, 'ping', $3, 1, now(), '{}')`,
        [id, school.schoolId, randomUUID()],
      );
      await expect
        .poll(
          async () =>
            (
              await system.query<{ published: boolean }>(
                'select published_at is not null as published from outbox where id = $1',
                [id],
              )
            ).rows[0]?.published,
          { timeout: 5000, interval: 20 },
        )
        .toBe(true);
    } finally {
      await app.close();
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length > 0) await redis.del(...keys);
      await redis.quit();
    }
    expect(app.get(WorkerLifecycle).running).toBe(false);
    expect(app.get(OutboxRelayLoop).running).toBe(false);
    expect(app.get(EventsWorker).running).toBe(false);
    expect(app.get(ScheduledJobs).running).toBe(false);
    expect(app.get(JobProcessors).running).toBe(false);
  });
});
