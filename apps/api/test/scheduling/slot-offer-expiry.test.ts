import { randomUUID } from 'node:crypto';
import { SlotOfferExpired } from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { SlotOfferExpiryJob } from '../../src/modules/scheduling/infra/slot-offer-expiry.job.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const HOUR = 3_600_000;

describe('slot offer expiry (worker)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let school: SchoolFixture;
  let other: SchoolFixture;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    school = await createSchoolFixture(system);
    other = await createSchoolFixture(system);
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  async function offer(
    f: SchoolFixture,
    expiresAt: Date,
    status: 'open' | 'taken' | 'expired' = 'open',
  ): Promise<string> {
    const id = randomUUID();
    const start = new Date(Date.now() + 48 * HOUR);
    await system.query(
      `insert into slot_offers (id, school_id, instructor_membership_id, lesson_type_id, period,
         source, offered_to_student_ids, expires_at, status)
       values ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'), 'manual',
         $7::uuid[], $8, $9)`,
      [
        id,
        f.schoolId,
        f.instructorIds[0],
        f.lessonTypeId,
        start.toISOString(),
        new Date(start.getTime() + HOUR).toISOString(),
        f.studentIds,
        expiresAt.toISOString(),
        status,
      ],
    );
    return id;
  }

  const statusOf = async (id: string) =>
    (await system.query<{ status: string }>('select status from slot_offers where id = $1', [id]))
      .rows[0]?.status;

  it('registers the per-school expiry job every minute', () => {
    expect(
      worker.app
        .get(ScheduledJobs)
        .list()
        .find((job) => job.name === 'scheduling.slot-offer-expiry'),
    ).toMatchObject({ every: 60_000 });
  });

  it('expires open offers past expires_at in every school, appends SlotOfferExpired once', async () => {
    const now = new Date();
    const due = await offer(school, new Date(now.getTime() - 60_000));
    const dueElsewhere = await offer(other, new Date(now.getTime() - 1));
    const fresh = await offer(school, new Date(now.getTime() + HOUR));
    const taken = await offer(school, new Date(now.getTime() - HOUR), 'taken');

    const summary = await worker.app.get(SlotOfferExpiryJob).expire(now);
    expect(summary.failed).toEqual([]);

    expect(await statusOf(due)).toBe('expired');
    expect(await statusOf(dueElsewhere)).toBe('expired');
    expect(await statusOf(fresh)).toBe('open');
    expect(await statusOf(taken)).toBe('taken');

    const events = await expectEvents(db, { type: SlotOfferExpired });
    expect(events.map((event) => event.aggregateId).sort()).toEqual([due, dueElsewhere].sort());
    const ownEvent = events.find((event) => event.aggregateId === due);
    expect(ownEvent).toMatchObject({
      schoolId: school.schoolId,
      aggregateType: 'slot_offer',
      aggregateVersion: 2,
      payload: {
        offerId: due,
        instructorMembershipId: school.instructorIds[0],
        source: 'manual',
        offeredToStudentIds: school.studentIds,
        expiredAt: now.toISOString(),
      },
    });

    await worker.app.get(SlotOfferExpiryJob).expire(new Date(now.getTime() + 1000));
    expect(await expectEvents(db, { type: SlotOfferExpired })).toHaveLength(2);
    expect(await statusOf(fresh)).toBe('open');
  });
});
