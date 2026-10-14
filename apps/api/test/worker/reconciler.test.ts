import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type DomainEvent, newEvent } from '../../src/kernel/cqrs/index.js';
import { JobQueues, QUEUES } from '../../src/kernel/jobs/index.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { PingRecorded } from '../fixtures/ping/index.js';
import { PingWorkerModule } from '../fixtures/ping/ping-worker.module.js';
import { PingRecordedSubscriber } from '../fixtures/ping/subscribers/ping-recorded.subscriber.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

describe('hourly delivery reconciler', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let harness: WorkerTestHarness;
  let pings: PingRecordedSubscriber;

  const publishAndRelay = async (message: string): Promise<DomainEvent> => {
    const [event] = (await harness.tenant.runInTenant(
      { schoolId: school.schoolId, userId: null },
      () =>
        harness.publisher.append([
          newEvent(PingRecorded, {
            aggregateType: 'ping',
            aggregateId: randomUUID(),
            aggregateVersion: 1,
            payload: { message },
          }),
        ]),
    )) as [DomainEvent];
    await harness.runRelayOnce();
    return event;
  };

  const loseRedisJobs = () => harness.app.get(JobQueues).queue(QUEUES.events).obliterate();

  const publishedAgo = (eventId: string, interval: string) =>
    system.query(`update outbox set published_at = now() - $2::interval where id = $1`, [
      eventId,
      interval,
    ]);

  const deliveries = async (eventId: string) =>
    (
      await system.query<{ subscriber: string }>(
        'select subscriber from event_deliveries where event_id = $1 order by subscriber',
        [eventId],
      )
    ).rows.map((row) => row.subscriber);

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    harness = await createWorkerTestHarness(db, [PingWorkerModule]);
    pings = harness.app.get(PingRecordedSubscriber);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await system?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    await harness.drainWorker();
    await system.query('delete from event_deliveries');
    await system.query('delete from dead_letters');
    await system.query('update outbox set published_at = now() - interval $$30 days$$');
    pings.received.length = 0;
  });

  it('re-enqueues an event published over an hour ago whose jobs Redis lost', async () => {
    const event = await publishAndRelay('lost');
    await loseRedisJobs();
    await publishedAgo(event.id, '61 minutes');

    expect(await harness.runReconcilerOnce()).toEqual({ reenqueued: 2 });
    await harness.drainWorker();

    expect(pings.received).toMatchObject([
      { eventId: event.id, payload: { message: 'lost' }, occurredAt: event.occurredAt },
    ]);
    expect(await deliveries(event.id)).toEqual(['ping.count', 'ping.recorded-log']);
    expect(await harness.runReconcilerOnce()).toEqual({ reenqueued: 0 });
  });

  it('re-enqueues only the subscriber that is missing a delivery', async () => {
    const event = await publishAndRelay('partial');
    await harness.drainWorker();
    await system.query(
      `delete from event_deliveries where event_id = $1 and subscriber = 'ping.recorded-log'`,
      [event.id],
    );
    await publishedAgo(event.id, '2 hours');
    pings.received.length = 0;

    expect(await harness.runReconcilerOnce()).toEqual({ reenqueued: 1 });
    await harness.drainWorker();

    expect(pings.received.map((r) => r.eventId)).toEqual([event.id]);
  });

  it('leaves events published less than an hour ago to the relay', async () => {
    const event = await publishAndRelay('recent');
    await loseRedisJobs();
    await publishedAgo(event.id, '59 minutes');

    expect(await harness.runReconcilerOnce()).toEqual({ reenqueued: 0 });
  });

  it('skips pairs that already went to dead_letters', async () => {
    const event = await publishAndRelay('dead');
    await loseRedisJobs();
    await publishedAgo(event.id, '2 hours');
    await system.query(
      `insert into dead_letters (id, subscriber, event_id, error, attempts, failed_at)
       values ($1, 'ping.recorded-log', $2, 'boom', 10, now())`,
      [randomUUID(), event.id],
    );

    expect(await harness.runReconcilerOnce()).toEqual({ reenqueued: 1 });
    expect(await harness.jobIds()).toEqual([`ping.count/${event.id}`]);
  });

  it('is a no-op for a job that is still queued in Redis', async () => {
    const event = await publishAndRelay('queued');
    await publishedAgo(event.id, '2 hours');

    await harness.runReconcilerOnce();

    expect(await harness.jobIds()).toEqual(
      [`ping.count/${event.id}`, `ping.recorded-log/${event.id}`].sort(),
    );
    await harness.drainWorker();
    expect(pings.received).toHaveLength(1);
  });

  it('ignores events published before the 24-hour lookback window', async () => {
    const event = await publishAndRelay('ancient');
    await loseRedisJobs();
    await publishedAgo(event.id, '26 hours');

    expect(await harness.runReconcilerOnce()).toEqual({ reenqueued: 0 });
  });
});
