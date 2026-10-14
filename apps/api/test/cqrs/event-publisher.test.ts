import { randomUUID } from 'node:crypto';
import { defineEvent } from '@driveos/shared';
import type pg from 'pg';
import { validate as isUuid, version as uuidVersion } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EventPublisher } from '../../src/kernel/cqrs/event-publisher.js';
import { type DomainEvent, newEvent } from '../../src/kernel/cqrs/domain-event.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';

const ThingCounted = defineEvent({
  type: 'ThingCounted',
  version: 3,
  schema: z.object({ count: z.number().int().nonnegative(), note: z.string().default('none') }),
});

interface OutboxRow {
  seq: string;
  id: string;
  school_id: string | null;
  type: string;
  version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  actor_user_id: string | null;
  occurred_at: Date;
  payload: unknown;
  published_at: Date | null;
}

describe('EventPublisher.append', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let kernel: KernelTestApp;
  let tenant: TenantContext;
  let publisher: EventPublisher;

  const outbox = async () =>
    (await system.query<OutboxRow>('select * from outbox order by seq')).rows;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    kernel = await createKernelTestApp(db);
    tenant = kernel.app.get(TenantContext);
    publisher = kernel.app.get(EventPublisher);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    await system.query('delete from outbox');
  });

  const counted = (count: number, aggregateId = randomUUID()) =>
    newEvent(ThingCounted, {
      aggregateType: 'thing',
      aggregateId,
      aggregateVersion: count + 1,
      payload: { count },
    });

  it('writes the full envelope to outbox inside the tenant transaction', async () => {
    const aggregateId = randomUUID();
    const events = await tenant.runInTenant(
      { schoolId: school.schoolId, userId: school.ownerUserId },
      () => publisher.append([counted(4, aggregateId)]),
    );

    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(events).toHaveLength(1);
    const [row] = rows as [OutboxRow];
    const [event] = events as [DomainEvent];
    expect(isUuid(row.id) && uuidVersion(row.id)).toBe(7);
    expect(row).toMatchObject({
      id: event.id,
      school_id: school.schoolId,
      type: 'ThingCounted',
      version: 3,
      aggregate_type: 'thing',
      aggregate_id: aggregateId,
      aggregate_version: 5,
      actor_user_id: school.ownerUserId,
      payload: { count: 4, note: 'none' },
      published_at: null,
    });
    expect(row.occurred_at.getTime()).toBe(event.occurredAt.getTime());
    expect(event).toEqual({
      id: row.id,
      type: 'ThingCounted',
      version: 3,
      schoolId: school.schoolId,
      aggregateType: 'thing',
      aggregateId,
      aggregateVersion: 5,
      actorUserId: school.ownerUserId,
      occurredAt: event.occurredAt,
      payload: { count: 4, note: 'none' },
    });
  });

  it('writes nothing when the transaction rolls back after the append', async () => {
    await expect(
      tenant.runInTenant({ schoolId: school.schoolId, userId: school.ownerUserId }, async () => {
        await publisher.append([counted(1)]);
        throw new Error('handler failed after append');
      }),
    ).rejects.toThrow('handler failed after append');

    expect(await outbox()).toEqual([]);
  });

  it('appends several events in order', async () => {
    await tenant.runInTenant({ schoolId: school.schoolId, userId: school.ownerUserId }, () =>
      publisher.append([counted(1), counted(2), counted(3)]),
    );

    expect((await outbox()).map((row) => (row.payload as { count: number }).count)).toEqual([
      1, 2, 3,
    ]);
  });

  it('stores a null school and actor when the scope has none', async () => {
    await tenant.runInTenant({ schoolId: null, userId: null }, () =>
      publisher.append([counted(0)]),
    );

    expect(await outbox()).toMatchObject([{ school_id: null, actor_user_id: null }]);
  });

  it('rejects an invalid payload with a non-validation error and writes nothing', async () => {
    const invalid = newEvent(ThingCounted, {
      aggregateType: 'thing',
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      payload: { count: -1, note: 'x' },
    });
    const error = await tenant
      .runInTenant({ schoolId: school.schoolId, userId: school.ownerUserId }, () =>
        publisher.append([counted(1), invalid]),
      )
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(z.ZodError);
    expect((error as Error).message).toMatch(/ThingCounted v3 payload is invalid/);
    expect(await outbox()).toEqual([]);
  });

  it('throws outside a tenant scope', async () => {
    await expect(publisher.append([counted(1)])).rejects.toThrow(/outside a tenant scope/);
  });

  it('does nothing for an empty list', async () => {
    await tenant.runInTenant({ schoolId: school.schoolId, userId: school.ownerUserId }, () =>
      publisher.append([]),
    );
    expect(await outbox()).toEqual([]);
  });
});
