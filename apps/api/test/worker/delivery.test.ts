import { Injectable, Logger } from '@nestjs/common';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DomainEvent, newEvent } from '../../src/kernel/cqrs/index.js';
import { EventSubscriber, type EventHandler } from '../../src/kernel/subscribers/index.js';
import { type LogContext, logContext } from '../../src/kernel/logging/log-context.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { PingRecorded } from '../fixtures/ping/index.js';
import { PingWorkerModule } from '../fixtures/ping/ping-worker.module.js';
import { PingRecordedSubscriber } from '../fixtures/ping/subscribers/ping-recorded.subscriber.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { defineEvent } from '@driveos/shared';
import { z } from 'zod';
import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

const ProbeFailed = defineEvent({
  type: 'ProbeFailed',
  version: 1,
  schema: z.object({ failTimes: z.number().int() }),
});

@Injectable()
@EventSubscriber({ name: 'probe.flaky', events: [ProbeFailed] })
class FlakySubscriber implements EventHandler<{ failTimes: number }> {
  readonly attempts = new Map<string, number>();
  readonly delivered: string[] = [];
  readonly logContexts = new Map<string, LogContext>();

  async handle(event: DomainEvent<{ failTimes: number }>): Promise<void> {
    this.logContexts.set(event.id, logContext());
    const attempt = (this.attempts.get(event.id) ?? 0) + 1;
    this.attempts.set(event.id, attempt);
    if (attempt <= event.payload.failTimes) throw new Error(`probe failure ${attempt}`);
    this.delivered.push(event.id);
  }
}

@Module({ providers: [FlakySubscriber] })
class ProbeWorkerModule {}

describe('outbox relay and event subscribers', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let harness: WorkerTestHarness;
  let pings: PingRecordedSubscriber;
  let flaky: FlakySubscriber;

  const ping = (message = 'hello') =>
    newEvent(PingRecorded, {
      aggregateType: 'ping',
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      payload: { message },
    });

  const publish = (events: Parameters<WorkerTestHarness['publisher']['append']>[0]) =>
    harness.tenant.runInTenant({ schoolId: school.schoolId, userId: school.ownerUserId }, () =>
      harness.publisher.append(events),
    );

  const outboxRow = async (id: string) =>
    (
      await system.query<{ published_at: Date | null }>(
        'select published_at from outbox where id = $1',
        [id],
      )
    ).rows[0];

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
    harness = await createWorkerTestHarness(db, [PingWorkerModule, ProbeWorkerModule]);
    pings = harness.app.get(PingRecordedSubscriber);
    flaky = harness.app.get(FlakySubscriber);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await system?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    await harness.drainWorker();
    pings.received.length = 0;
  });

  it('enqueues one job per registered subscriber and marks the event published', async () => {
    const [event] = (await publish([ping()])) as [DomainEvent];

    const relayed = await harness.runRelayOnce();

    expect(relayed).toEqual({ events: 1, jobs: 2 });
    expect((await outboxRow(event.id))?.published_at).toBeInstanceOf(Date);
    expect(await harness.jobIds()).toEqual(
      [`ping.count/${event.id}`, `ping.recorded-log/${event.id}`].sort(),
    );
  });

  it('delivers at least once and runs the subscriber once', async () => {
    const [event] = (await publish([ping('once')])) as [DomainEvent];
    await harness.runRelayOnce();
    await system.query('update outbox set published_at = null where id = $1', [event.id]);
    expect(await harness.runRelayOnce()).toEqual({ events: 1, jobs: 2 });

    await harness.drainWorker();
    await system.query('update outbox set published_at = null where id = $1', [event.id]);
    const again = await harness.drainWorker();

    expect(again.relayed).toBe(1);
    expect(pings.received.map((r) => r.eventId)).toEqual([event.id]);
    expect(await deliveries(event.id)).toEqual(['ping.count', 'ping.recorded-log']);
    expect((await outboxRow(event.id))?.published_at).toBeInstanceOf(Date);
  });

  it('runs the subscriber as app_rw with the event school and no user', async () => {
    const [event] = (await publish([ping('tenant')])) as [DomainEvent];

    await harness.drainWorker();

    expect(pings.received).toEqual([
      {
        eventId: event.id,
        payload: { message: 'tenant' },
        occurredAt: event.occurredAt,
        role: 'app_rw',
        schoolId: school.schoolId,
        userId: '',
      },
    ]);
  });

  it('delivers an event without a school with an empty app.school_id', async () => {
    const [event] = (await harness.tenant.runInTenant({ schoolId: null, userId: null }, () =>
      harness.publisher.append([ping('global')]),
    )) as [DomainEvent];

    await harness.drainWorker();

    expect(pings.received).toMatchObject([{ eventId: event.id, schoolId: '' }]);
  });

  it('still delivers an event that commits after a later event was relayed', async () => {
    const app = await connect(db.appUrl);
    try {
      await app.query('begin');
      await app.query(`select set_config('app.school_id', $1, true)`, [school.schoolId]);
      const late = randomUUID();
      await app.query(
        `insert into outbox (id, school_id, type, version, aggregate_type, aggregate_id,
          aggregate_version, occurred_at, payload) values ($1, $2, 'PingRecorded', 1, 'ping', $3, 1, now(), $4)`,
        [late, school.schoolId, randomUUID(), JSON.stringify({ message: 'late' })],
      );
      const [early] = (await publish([ping('early')])) as [DomainEvent];
      const seqs = (
        await system.query<{ id: string; seq: string }>(
          'select id, seq from outbox where id = any($1)',
          [[early.id]],
        )
      ).rows;

      expect(await harness.runRelayOnce()).toEqual({ events: 1, jobs: 2 });
      await app.query('commit');
      const lateSeq = (
        await system.query<{ seq: string }>('select seq from outbox where id = $1', [late])
      ).rows[0]?.seq;
      expect(Number(lateSeq)).toBeLessThan(Number(seqs[0]?.seq));

      await harness.drainWorker();

      expect(pings.received.map((r) => r.payload.message).sort()).toEqual(['early', 'late']);
      expect(await deliveries(late)).toEqual(['ping.count', 'ping.recorded-log']);
    } finally {
      await app.end();
    }
  });

  it('retries a failing subscriber with backoff and records one delivery', async () => {
    const [event] = (await publish([
      newEvent(ProbeFailed, {
        aggregateType: 'probe',
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        payload: { failTimes: 3 },
      }),
    ])) as [DomainEvent];

    const drained = await harness.drainWorker();

    expect(flaky.attempts.get(event.id)).toBe(4);
    expect(flaky.delivered).toContain(event.id);
    expect(drained).toMatchObject({ completed: 1, failed: 3 });
    expect(await deliveries(event.id)).toEqual(['probe.flaky']);
    const dead = await system.query('select 1 from dead_letters where event_id = $1', [event.id]);
    expect(dead.rowCount).toBe(0);
    expect(flaky.logContexts.get(event.id)).toEqual({
      eventId: event.id,
      eventType: 'ProbeFailed',
      subscriber: 'probe.flaky',
      schoolId: school.schoolId,
    });
  });

  it('moves the event to dead_letters after 10 failed attempts and raises an alert', async () => {
    const alert = vi.spyOn(Logger.prototype, 'error');
    const [event] = (await publish([
      newEvent(ProbeFailed, {
        aggregateType: 'probe',
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        payload: { failTimes: 100 },
      }),
    ])) as [DomainEvent];

    const drained = await harness.drainWorker();

    expect(flaky.attempts.get(event.id)).toBe(10);
    expect(drained).toMatchObject({ completed: 0, failed: 10 });
    const dead = await system.query<{
      subscriber: string;
      error: string;
      attempts: number;
      failed_at: Date;
    }>('select subscriber, error, attempts, failed_at from dead_letters where event_id = $1', [
      event.id,
    ]);
    expect(dead.rows).toEqual([
      {
        subscriber: 'probe.flaky',
        error: expect.stringContaining('probe failure 10') as string,
        attempts: 10,
        failed_at: expect.any(Date) as Date,
      },
    ]);
    expect(await deliveries(event.id)).toEqual([]);
    expect(alert).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: 'dead_letter',
        subscriber: 'probe.flaky',
        eventId: event.id,
        eventType: 'ProbeFailed',
        attempts: 10,
      }),
    );
    alert.mockRestore();
  });

  it('marks events without subscribers as published without enqueueing jobs', async () => {
    const Unheard = defineEvent({ type: 'NobodyListens', version: 1, schema: z.object({}) });
    const [event] = (await publish([
      newEvent(Unheard, {
        aggregateType: 'thing',
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        payload: {},
      }),
    ])) as [DomainEvent];

    expect(await harness.runRelayOnce()).toEqual({ events: 1, jobs: 0 });
    expect((await outboxRow(event.id))?.published_at).toBeInstanceOf(Date);
  });
});
