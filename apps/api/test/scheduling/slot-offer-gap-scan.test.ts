import { SlotOfferCreated } from '@driveos/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { localToUtcOrTransition } from '../../src/modules/scheduling/domain/time-zone.js';
import { SlotOfferGapScanJob } from '../../src/modules/scheduling/infra/slot-offer-gap-scan.job.js';
import { slotOffers } from '../../src/modules/scheduling/infra/schema.js';
import { students } from '../../src/modules/training/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { createLogin } from '../training/support.js';
import {
  insertLesson,
  insertLessonType,
  insertStudent,
  insertWeekdayAvailability,
} from './support.js';

const ZONE = 'Europe/Berlin';
const NOW = new Date('2027-03-01T01:00:00Z');
const WEEK = ['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05'];
const at = (date: string, time: string) => localToUtcOrTransition(date, time, ZONE);
const sorted = (ids: readonly string[]) => [...ids].sort();

describe('nightly slot offer gap scan (worker)', () => {
  let db: ScratchDatabase;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let ingo: string;
  let ina: string;
  let standard: string;
  let anchor: string;
  let inaAnchor: string;
  let rich: string;
  let poor: string;

  async function student(name: string, minutes: number): Promise<string> {
    const id = await insertStudent(tenants, A, name);
    await tenants.asSchool(A, async (tx) => {
      await tx.update(students).set({ area: 'Mitte' }).where(eq(students.id, id));
      await tx.insert(ledgerEntries).values({
        schoolId: A.schoolId,
        studentId: id,
        entryType: 'adjustment',
        minutes,
        note: 'test credit',
        createdByMembershipId: A.ownerMembershipId,
      });
    });
    return id;
  }

  async function lesson(
    instructorMembershipId: string,
    date: string,
    time: string,
    minutes: number,
  ) {
    await insertLesson(tenants, A, {
      studentId: instructorMembershipId === ingo ? anchor : inaAnchor,
      instructorMembershipId,
      lessonTypeId: standard,
      start: at(date, time).toISOString(),
      minutes,
    });
  }

  const offersOf = (instructorMembershipId: string) =>
    tenants.asSchool(A, (tx) =>
      tx
        .select()
        .from(slotOffers)
        .where(eq(slotOffers.instructorMembershipId, instructorMembershipId))
        .orderBy(sql`lower(${slotOffers.period})`),
    );

  beforeAll(async () => {
    db = await createScratchDatabase();
    worker = await createWorkerTestHarness(db);
    tenants = await createTestTenants(db, { context: worker.tenant });
    ({ A } = tenants);
    ingo = (await createLogin(tenants, A, ['instructor'])).membershipId;
    ina = (await createLogin(tenants, A, ['instructor'])).membershipId;
    await createLogin(tenants, A, ['instructor']);
    standard = await insertLessonType(tenants, A, { name: 'Standard lesson', minutes: 60 });
    await insertLessonType(tenants, A, { name: 'Long lesson', minutes: 90, creditMinutes: 90 });
    await insertLessonType(tenants, A, {
      name: 'Retired short lesson',
      minutes: 30,
      creditMinutes: 30,
      active: false,
    });
    await insertLessonType(tenants, A, {
      name: 'Exam',
      kind: 'exam',
      minutes: 45,
      creditMinutes: 45,
    });
    await insertWeekdayAvailability(tenants, A, ingo);
    await insertWeekdayAvailability(tenants, A, ina);
    anchor = await student('Anton Anchor', 1000);
    inaAnchor = await student('Ida Anchor', 1000);
    rich = await student('Rita Rich', 1000);
    poor = await student('Paula Poor', 30);

    await lesson(ingo, WEEK[0] as string, '09:00', 60);
    await lesson(ingo, WEEK[0] as string, '10:45', 75);
    await lesson(ingo, WEEK[0] as string, '13:00', 240);
    for (const date of WEEK.slice(1)) await lesson(ingo, date, '09:00', 480);
    for (const date of WEEK) {
      for (const time of ['10:00', '12:00', '14:00', '16:00']) await lesson(ina, date, time, 60);
    }
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await tenants?.close();
    await db?.drop();
  });

  it('registers the nightly per-school gap scan', () => {
    expect(
      worker.app
        .get(ScheduledJobs)
        .list()
        .find((job) => job.name === 'scheduling.slot-offer-gap-scan'),
    ).toMatchObject({ pattern: '0 2 * * *' });
  });

  it('offers a gap of the shortest active lesson type, not a shorter one, to students with credit', async () => {
    const summary = await worker.app.get(SlotOfferGapScanJob).scan(NOW);
    expect(summary.failed).toEqual([]);

    const offers = await offersOf(ingo);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      source: 'gap',
      status: 'open',
      lessonTypeId: standard,
      vehicleId: null,
      period: { start: at(WEEK[0] as string, '12:00'), end: at(WEEK[0] as string, '13:00') },
      expiresAt: new Date(NOW.getTime() + 120 * 60_000),
    });
    expect(sorted(offers[0]?.offeredToStudentIds ?? [])).toEqual(sorted([anchor, inaAnchor, rich]));
    expect(offers[0]?.offeredToStudentIds).not.toContain(poor);

    const events = await expectEvents(db, { type: SlotOfferCreated });
    expect(events.find((event) => event.aggregateId === offers[0]?.id)?.payload).toMatchObject({
      source: 'gap',
      creditMinutes: 60,
    });
  });

  it('caps open gap offers per instructor at 5, earliest gaps first', async () => {
    const offers = await offersOf(ina);
    expect(offers.map((offer) => offer.period.start)).toEqual([
      at(WEEK[0] as string, '09:00'),
      at(WEEK[0] as string, '11:00'),
      at(WEEK[0] as string, '13:00'),
      at(WEEK[0] as string, '15:00'),
      at(WEEK[1] as string, '09:00'),
    ]);
  });

  it('creates nothing new on a second run', async () => {
    const before = (await expectEvents(db, { type: SlotOfferCreated })).length;
    const summary = await worker.app.get(SlotOfferGapScanJob).scan(NOW);
    expect(summary.failed).toEqual([]);
    expect(await expectEvents(db, { type: SlotOfferCreated })).toHaveLength(before);
    expect(await offersOf(ingo)).toHaveLength(1);
    expect(await offersOf(ina)).toHaveLength(5);
  });
});
