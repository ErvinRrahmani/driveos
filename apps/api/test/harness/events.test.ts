import { defineEvent } from '@driveos/shared';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { newId } from '../../src/kernel/db/columns.js';
import { EventPublisher, newEvent } from '../../src/kernel/cqrs/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { PingRecorded } from '../fixtures/ping/index.js';
import {
  expectEventAppended,
  expectEvents,
  expectNoEvent,
  lastEventOf,
} from '../support/events.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';

const Trimmed = defineEvent({
  type: 'HarnessTrimmed',
  version: 2,
  schema: z.object({ label: z.string(), count: z.number().int() }),
});

describe('event-assertion helpers', () => {
  let db: ScratchDatabase;
  let tenants: TestTenants;
  let publisher: EventPublisher;

  const ping = (tenant: TestTenant, message: string, aggregateId = newId()) =>
    tenants.asSchool(tenant, () =>
      publisher.append([
        newEvent(PingRecorded, {
          aggregateType: 'ping',
          aggregateId,
          aggregateVersion: 1,
          payload: { message },
        }),
      ]),
    );

  beforeAll(async () => {
    db = await createScratchDatabase();
    tenants = await createTestTenants(db);
    publisher = new EventPublisher(tenants.context);
  }, 60_000);

  afterAll(async () => {
    await tenants?.close();
    await db?.drop();
  });

  it('finds an appended event with its full envelope, read as app_system', async () => {
    const aggregateId = newId();
    const [appended] = await ping(tenants.A, 'hello', aggregateId);

    const found = await expectEvents(db, { aggregateId });

    expect(found).toEqual([
      {
        ...appended,
        seq: expect.any(Number),
        publishedAt: null,
      },
    ]);
  });

  it('filters by type, aggregate and school', async () => {
    const aggregateId = newId();
    await ping(tenants.A, 'a-side', aggregateId);
    await ping(tenants.B, 'b-side', aggregateId);

    const asA = await expectEvents(db, {
      type: 'PingRecorded',
      aggregateId,
      schoolId: tenants.A.schoolId,
    });
    const both = await expectEvents(db, { aggregateType: 'ping', aggregateId });

    expect(asA.map((e) => e.payload)).toEqual([{ message: 'a-side' }]);
    expect(both.map((e) => e.schoolId)).toEqual([tenants.A.schoolId, tenants.B.schoolId]);
  });

  it('types and parses payloads when given the event definition, matching its version', async () => {
    const aggregateId = newId();
    await tenants.asSchool(tenants.A, () =>
      publisher.append([
        newEvent(Trimmed, {
          aggregateType: 'harness',
          aggregateId,
          aggregateVersion: 3,
          payload: { label: 'x', count: 2 },
        }),
      ]),
    );

    const event = await expectEventAppended(db, { type: Trimmed, aggregateId });

    expectTypeOf(event.payload).toEqualTypeOf<{ label: string; count: number }>();
    expect(event).toMatchObject({ type: 'HarnessTrimmed', version: 2, aggregateVersion: 3 });
    expect(event.payload).toEqual({ label: 'x', count: 2 });
    await expectNoEvent(db, { type: { ...Trimmed, version: 1 }, aggregateId });
  });

  it('expectEventAppended checks an exact count and returns the latest match', async () => {
    const aggregateId = newId();
    await ping(tenants.A, 'first', aggregateId);
    await ping(tenants.A, 'second', aggregateId);

    const last = await expectEventAppended(db, { type: PingRecorded, aggregateId }, { count: 2 });

    expect(last.payload.message).toBe('second');
    await expect(
      expectEventAppended(db, { type: PingRecorded, aggregateId }, { count: 1 }),
    ).rejects.toThrow(/expected 1 PingRecorded event/i);
  });

  it('expectEventAppended fails with a clear message when nothing matches', async () => {
    await expect(
      expectEventAppended(db, { type: PingRecorded, aggregateId: newId() }),
    ).rejects.toThrow(/expected at least one PingRecorded event/i);
  });

  it('expectNoEvent passes after a rolled-back command and fails when the event exists', async () => {
    const aggregateId = newId();
    await expect(
      tenants.asSchool(tenants.A, async () => {
        await publisher.append([
          newEvent(PingRecorded, {
            aggregateType: 'ping',
            aggregateId,
            aggregateVersion: 1,
            payload: { message: 'rolled back' },
          }),
        ]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    await expectNoEvent(db, { type: PingRecorded, aggregateId });

    await ping(tenants.A, 'committed', aggregateId);
    await expect(expectNoEvent(db, { type: PingRecorded, aggregateId })).rejects.toThrow(
      /expected no PingRecorded event/i,
    );
  });

  it('lastEventOf returns the most recent event of a type, or undefined', async () => {
    await ping(tenants.B, 'latest-b');

    const last = await lastEventOf(db, PingRecorded);
    const lastForA = await lastEventOf(db, PingRecorded, { schoolId: tenants.A.schoolId });

    expect(last?.payload).toEqual({ message: 'latest-b' });
    expect(lastForA?.schoolId).toBe(tenants.A.schoolId);
    expect(await lastEventOf(db, 'NeverAppended')).toBeUndefined();
  });

  it('filters events without a school with schoolId: null', async () => {
    const aggregateId = newId();
    await tenants.context.runInTenant({ schoolId: null, userId: null }, () =>
      publisher.append([
        newEvent(PingRecorded, {
          aggregateType: 'ping',
          aggregateId,
          aggregateVersion: 1,
          payload: { message: 'global' },
        }),
      ]),
    );

    expect(await expectEvents(db, { aggregateId, schoolId: null })).toHaveLength(1);
    expect(await expectEvents(db, { aggregateId, schoolId: tenants.A.schoolId })).toEqual([]);
  });
});
