import { randomUUID } from 'node:crypto';
import { Injectable, Module } from '@nestjs/common';
import { defineEvent } from '@driveos/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type DomainEvent, newEvent } from '../../src/kernel/cqrs/index.js';
import { Projection } from '../../src/kernel/projections/index.js';
import { EventSubscriber } from '../../src/kernel/subscribers/index.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { PingRecorded } from '../fixtures/ping/index.js';
import { PingWorkerModule } from '../fixtures/ping/ping-worker.module.js';
import { PingCountProjection } from '../fixtures/ping/projections/ping-count.projection.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const ProbeTicked = defineEvent({
  type: 'ProbeTicked',
  version: 1,
  schema: z.object({ delayMs: z.number().int() }),
});

@Injectable()
@EventSubscriber({ name: 'probe.serialized', events: [ProbeTicked] })
class SerializedProjection extends Projection<{ delayMs: number }> {
  protected override readonly serializePerSchool = true;
  readonly spans: { start: number; end: number; locks: number }[] = [];

  protected async apply(event: DomainEvent<{ delayMs: number }>): Promise<void> {
    const start = Date.now();
    const locks = await this.tenant.tx.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`,
    );
    await new Promise((resolve) => setTimeout(resolve, event.payload.delayMs));
    this.spans.push({ start, end: Date.now(), locks: locks.rows[0]?.n ?? 0 });
  }
}

@Module({ providers: [SerializedProjection] })
class ProbeProjectionModule {}

describe('Projection base class', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let harness: WorkerTestHarness;
  let projection: PingCountProjection;

  const publish = (
    aggregateId: string,
    versions: number[],
    schoolId: string | null = school.schoolId,
  ) =>
    harness.tenant.runInTenant({ schoolId, userId: null }, () =>
      harness.publisher.append(
        versions.map((aggregateVersion) =>
          newEvent(PingRecorded, {
            aggregateType: 'ping',
            aggregateId,
            aggregateVersion,
            payload: { message: `v${aggregateVersion}` },
          }),
        ),
      ),
    );

  const position = async (aggregateId: string) =>
    (
      await system.query<{ school_id: string; aggregate_version: number }>(
        `select school_id, aggregate_version from projection_positions
          where projection = 'ping.count' and aggregate_type = 'ping' and aggregate_id = $1`,
        [aggregateId],
      )
    ).rows;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    harness = await createWorkerTestHarness(db, [PingWorkerModule, ProbeProjectionModule]);
    projection = harness.app.get(PingCountProjection);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await system?.end();
    await db?.drop();
  });

  beforeEach(() => {
    projection.applied.length = 0;
  });

  it('applies newer versions, skips stale and repeated ones, and stores the position', async () => {
    const aggregateId = randomUUID();
    await publish(aggregateId, [2, 1, 3, 3]);

    await harness.drainWorker();

    expect(projection.applied.map((e) => e.aggregateVersion)).toEqual([2, 3]);
    expect(await position(aggregateId)).toEqual([
      { school_id: school.schoolId, aggregate_version: 3 },
    ]);
  });

  it('tracks positions per aggregate', async () => {
    const first = randomUUID();
    const second = randomUUID();
    await publish(first, [5]);
    await publish(second, [1]);

    await harness.drainWorker();

    expect(projection.applied.map((e) => [e.aggregateId, e.aggregateVersion])).toEqual([
      [first, 5],
      [second, 1],
    ]);
  });

  it('keeps the position under tenant RLS: other schools cannot see it', async () => {
    const aggregateId = randomUUID();
    await publish(aggregateId, [1]);
    await harness.drainWorker();
    const other = await createSchoolFixture(system);

    const seen = await harness.tenant.runInTenant({ schoolId: other.schoolId, userId: null }, () =>
      harness.tenant.tx.execute(
        sql`select 1 from projection_positions where aggregate_id = ${aggregateId}`,
      ),
    );

    expect(seen.rows).toEqual([]);
  });

  it('fails the delivery for an event without a school', async () => {
    await expect(
      projection.handle(
        {
          id: randomUUID(),
          type: 'PingRecorded',
          version: 1,
          schoolId: null,
          aggregateType: 'ping',
          aggregateId: randomUUID(),
          aggregateVersion: 1,
          actorUserId: null,
          occurredAt: new Date(),
          payload: { message: 'x' },
        },
        { subscriber: 'ping.count', attempt: 1 },
      ),
    ).rejects.toThrow(/without a school/);
  });

  it('serializes deliveries per school with an advisory lock when asked to', async () => {
    const serialized = harness.app.get(SerializedProjection);
    await harness.tenant.runInTenant({ schoolId: school.schoolId, userId: null }, () =>
      harness.publisher.append(
        [0, 1, 2].map(() =>
          newEvent(ProbeTicked, {
            aggregateType: 'probe',
            aggregateId: randomUUID(),
            aggregateVersion: 1,
            payload: { delayMs: 150 },
          }),
        ),
      ),
    );

    await harness.drainWorker({ concurrency: 3 });

    const spans = [...serialized.spans].sort((a, b) => a.start - b.start);
    expect(spans).toHaveLength(3);
    for (const span of spans) expect(span.locks).toBe(2);
    for (const [i, span] of spans.entries()) {
      const previous = spans[i - 1];
      if (previous) expect(span.start).toBeGreaterThanOrEqual(previous.end);
    }
  });
});
