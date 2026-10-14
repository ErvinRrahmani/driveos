import { LessonCancelled, SlotOfferCreated } from '@driveos/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommandBus, newEvent } from '../../src/kernel/cqrs/index.js';
import { newId } from '../../src/kernel/db/columns.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { devices } from '../../src/modules/identity/infra/schema.js';
import { NotificationClock } from '../../src/modules/messaging/infra/notification-clock.js';
import { NotificationDispatchJob } from '../../src/modules/messaging/infra/notification-dispatch.job.js';
import { OfferCancelledSlotCommand } from '../../src/modules/scheduling/commands/offer-cancelled-slot.command.js';
import { lessons, slotOffers } from '../../src/modules/scheduling/infra/schema.js';
import {
  addDays,
  isoWeekday,
  localDateOf,
  localToUtcOrTransition,
} from '../../src/modules/scheduling/domain/time-zone.js';
import { SlotOffersFromCancellationsSubscriber } from '../../src/modules/scheduling/subscribers/slot-offers-from-cancellations.subscriber.js';
import { students } from '../../src/modules/training/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createUser } from '../identity/support.js';
import { expectEvents } from '../support/events.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { createLogin } from '../training/support.js';
import {
  insertLesson,
  insertLessonType,
  insertSlotOffer,
  insertStudent,
  insertWaitingListEntry,
  insertWeekdayAvailability,
} from './support.js';

const ZONE = 'Europe/Berlin';
const HOUR = 3_600_000;
const MINUTE = 60_000;
const sorted = (ids: readonly string[]) => [...ids].sort();

type NewEvent = Parameters<WorkerTestHarness['publisher']['append']>[0][number];

function weekdaySlot(index: number, time: string): Date {
  let date = addDays(localDateOf(new Date(), ZONE), 2);
  let seen = -1;
  for (;;) {
    if (isoWeekday(date) <= 5) {
      seen += 1;
      if (seen === index) return localToUtcOrTransition(date, time, ZONE);
    }
    date = addDays(date, 1);
  }
}

describe('slot offers from cancellations (worker)', () => {
  let db: ScratchDatabase;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let ingo: string;
  let ina: string;
  let standard: string;
  let current = new Date();
  const clock = { now: () => current };

  beforeAll(async () => {
    db = await createScratchDatabase();
    worker = await createWorkerTestHarness(db, [], {}, [
      { provide: NotificationClock, useValue: clock },
    ]);
    tenants = await createTestTenants(db, { context: worker.tenant });
    ({ A } = tenants);
    ingo = (await createLogin(tenants, A, ['instructor'])).membershipId;
    ina = (await createLogin(tenants, A, ['instructor'])).membershipId;
    standard = await insertLessonType(tenants, A, { name: 'Standard lesson' });
    await insertWeekdayAvailability(tenants, A, ingo);
    await insertWeekdayAvailability(tenants, A, ina);
  }, 60_000);

  beforeEach(() => {
    worker.push.clear();
    worker.sms.clear();
    worker.email.clear();
  });

  afterAll(async () => {
    await worker?.close();
    await tenants?.close();
    await db?.drop();
  });

  async function student(
    name: string,
    area: string,
    minutes: number,
    withUser = false,
  ): Promise<{ id: string; userId: string | null }> {
    let userId: string | null = null;
    if (withUser) {
      const user = await createUser(tenants, {
        phone: `+4915${Math.floor(Math.random() * 1e9)}`,
        email: `${newId()}@example.com`,
        memberships: [{ tenant: A, roles: ['student'] }],
      });
      userId = user.userId;
      await tenants.asSystem((tx) =>
        tx.insert(devices).values({
          userId: user.userId,
          platform: 'ios',
          pushToken: `ExponentPushToken[${user.userId}]`,
          locale: 'en',
          lastSeenAt: new Date(),
        }),
      );
    }
    const id = await insertStudent(tenants, A, name, userId);
    await tenants.asSchool(A, async (tx) => {
      await tx.update(students).set({ area }).where(eq(students.id, id));
      if (minutes !== 0) {
        await tx.insert(ledgerEntries).values({
          schoolId: A.schoolId,
          studentId: id,
          entryType: 'adjustment',
          minutes,
          note: 'test credit',
          createdByMembershipId: A.ownerMembershipId,
        });
      }
    });
    return { id, userId };
  }

  async function cancelledLesson(
    studentId: string,
    instructorMembershipId: string,
    start: Date,
    lessonTypeId = standard,
  ): Promise<NewEvent> {
    const lessonId = await insertLesson(tenants, A, {
      studentId,
      instructorMembershipId,
      lessonTypeId,
      start: start.toISOString(),
    });
    await tenants.asSchool(A, (tx) =>
      tx
        .update(lessons)
        .set({ status: 'cancelled', cancelledAt: new Date(), version: 2 })
        .where(eq(lessons.id, lessonId)),
    );
    return newEvent(LessonCancelled, {
      aggregateType: 'lesson',
      aggregateId: lessonId,
      aggregateVersion: 2,
      payload: {
        lessonId,
        studentId,
        instructorMembershipId,
        vehicleId: null,
        lessonTypeId,
        creditMinutes: 60,
        start: start.toISOString(),
        end: new Date(start.getTime() + HOUR).toISOString(),
        late: false,
        byRole: 'student',
        minutesRestored: 60,
        cancelledByMembershipId: A.ownerMembershipId,
      },
    });
  }

  async function publish(event: NewEvent): Promise<void> {
    await worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
      worker.publisher.append([event]),
    );
    expect((await worker.drainWorker()).failed).toBe(0);
  }

  const offersAt = (instructorMembershipId: string, start: Date) =>
    tenants.asSchool(A, (tx) =>
      tx
        .select()
        .from(slotOffers)
        .where(
          and(
            eq(slotOffers.instructorMembershipId, instructorMembershipId),
            sql`lower(${slotOffers.period}) = ${start.toISOString()}::timestamptz`,
          ),
        ),
    );

  const notificationsOf = async (offerId: string) =>
    (
      await tenants.asSystem((tx) =>
        tx.execute<{ user_id: string; channel: string; status: string }>(
          sql`select user_id, channel::text as channel, status::text as status
                from notifications
               where template = 'slot_offer_created' and payload->>'offerId' = ${offerId}
               order by channel`,
        ),
      )
    ).rows;

  it('registers the cancellation subscriber in the worker', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain(
      'scheduling.slot-offers-from-cancellations',
    );
  });

  it('offers a cancelled slot more than 2 h away to area students with enough credit, once', async () => {
    current = new Date('2026-07-01T10:00:00Z');
    const start = weekdaySlot(0, '10:00');
    const anchor = await student('Anton Anchor', 'Mitte', 1000);
    await insertLesson(tenants, A, {
      studentId: anchor.id,
      instructorMembershipId: ingo,
      lessonTypeId: standard,
      start: new Date(start.getTime() - HOUR).toISOString(),
    });
    const canceller = await student('Carla Canceller', 'Mitte', 1000);
    const rich = await student('Rita Rich', 'Mitte', 1000, true);
    const poor = await student('Paula Poor', 'Mitte', 30, true);
    const elsewhere = await student('Peter Pankow', 'Pankow', 1000);

    const event = await cancelledLesson(canceller.id, ingo, start);
    await publish(event);

    const offers = await offersAt(ingo, start);
    expect(offers).toHaveLength(1);
    const [offer] = offers;
    expect(offer).toMatchObject({ source: 'cancellation', status: 'open', vehicleId: null });
    expect(offer?.period.end).toEqual(new Date(start.getTime() + HOUR));
    expect(sorted(offer?.offeredToStudentIds ?? [])).toEqual(sorted([anchor.id, rich.id]));
    expect(offer?.offeredToStudentIds).not.toContain(canceller.id);
    expect(offer?.offeredToStudentIds).not.toContain(poor.id);
    expect(offer?.offeredToStudentIds).not.toContain(elsewhere.id);

    const created = (await expectEvents(db, { type: SlotOfferCreated })).filter(
      (e) => e.aggregateId === offer?.id,
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.payload).toMatchObject({ source: 'cancellation', lessonTypeId: standard });

    const recorded = (await expectEvents(db, { type: LessonCancelled })).find(
      (e) => e.aggregateId === event.aggregateId,
    );
    if (!recorded) throw new Error('LessonCancelled not recorded');
    await worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
      worker.app.get(SlotOffersFromCancellationsSubscriber).handle(recorded),
    );
    expect((await worker.drainWorker()).failed).toBe(0);
    expect(await offersAt(ingo, start)).toHaveLength(1);

    expect(await notificationsOf(offer?.id ?? '')).toEqual([
      { user_id: rich.userId, channel: 'push', status: 'scheduled' },
    ]);
    await worker.app.get(NotificationDispatchJob).dispatch(current);
    expect(worker.push.sent.map((push) => push.token)).toEqual([
      `ExponentPushToken[${rich.userId}]`,
    ]);
    expect(worker.sms.sent).toEqual([]);
  });

  it('emails the offer instead of pushing during quiet hours, never SMS', async () => {
    current = new Date('2026-07-01T22:30:00Z');
    const start = weekdaySlot(1, '15:00');
    const anchor = await student('Nina Night', 'Wedding', 1000);
    await insertLesson(tenants, A, {
      studentId: anchor.id,
      instructorMembershipId: ina,
      lessonTypeId: standard,
      start: new Date(start.getTime() + HOUR).toISOString(),
    });
    const canceller = await student('Carl Night', 'Wedding', 1000);
    const owl = await student('Olga Owl', 'Wedding', 1000, true);

    await publish(await cancelledLesson(canceller.id, ina, start));

    const [offer] = await offersAt(ina, start);
    expect(sorted(offer?.offeredToStudentIds ?? [])).toEqual(sorted([owl.id, anchor.id]));
    expect(await notificationsOf(offer?.id ?? '')).toEqual([
      { user_id: owl.userId, channel: 'email', status: 'scheduled' },
    ]);
  });

  it('creates no offer for a lesson less than 2 h away', async () => {
    const start = weekdaySlot(2, '11:00');
    const canceller = await student('Lena Late', 'Moabit', 1000);
    await student('Mia Moabit', 'Moabit', 1000);
    const event = await cancelledLesson(canceller.id, ingo, start);
    const payload = event.payload as { lessonId: string };
    const run = (now: Date) =>
      worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
        worker.app
          .get(CommandBus)
          .execute(new OfferCancelledSlotCommand(payload.lessonId, canceller.id, now)),
      );

    expect(await run(new Date(start.getTime() - 2 * HOUR + MINUTE))).toBeNull();
    expect(await offersAt(ingo, start)).toEqual([]);
  });

  it('creates no offer when the slot was re-booked or already has an open offer', async () => {
    const rebookedAt = weekdaySlot(3, '09:00');
    const offeredAt = weekdaySlot(3, '13:00');
    const canceller = await student('Rolf Rebook', 'Neukölln', 1000);
    const other = await student('Nora Neukölln', 'Neukölln', 1000);

    const rebooked = await cancelledLesson(canceller.id, ingo, rebookedAt);
    await insertLesson(tenants, A, {
      studentId: other.id,
      instructorMembershipId: ingo,
      lessonTypeId: standard,
      start: rebookedAt.toISOString(),
    });
    await publish(rebooked);
    expect(await offersAt(ingo, rebookedAt)).toEqual([]);

    const offered = await cancelledLesson(canceller.id, ingo, offeredAt);
    const existing = await insertSlotOffer(tenants, A, {
      instructorMembershipId: ingo,
      lessonTypeId: standard,
      start: new Date(offeredAt.getTime() + 30 * MINUTE).toISOString(),
      offeredToStudentIds: [other.id],
    });
    await publish(offered);
    const open = await tenants.asSchool(A, (tx) =>
      tx
        .select({ id: slotOffers.id })
        .from(slotOffers)
        .where(
          and(
            eq(slotOffers.instructorMembershipId, ingo),
            sql`${slotOffers.period} && tstzrange(${offeredAt.toISOString()}::timestamptz, ${new Date(offeredAt.getTime() + HOUR).toISOString()}::timestamptz)`,
          ),
        ),
    );
    expect(open).toEqual([{ id: existing }]);
  });

  it('offers to matching waiting-list students before area matches, skipping those without credit', async () => {
    const waitType = await insertLessonType(tenants, A, { name: 'Waiting lesson' });
    const start = weekdaySlot(4, '14:00');
    const weekday = isoWeekday(localDateOf(start, ZONE));
    const anchor = await student('Kai Kreuzberg', 'Kreuzberg', 1000);
    await insertLesson(tenants, A, {
      studentId: anchor.id,
      instructorMembershipId: ina,
      lessonTypeId: waitType,
      start: new Date(start.getTime() - HOUR).toISOString(),
    });
    const canceller = await student('Wanda Weg', 'Kreuzberg', 1000);
    const areaMatch = await student('Arne Area', 'Kreuzberg', 1000);
    const brokeWaiter = await student('Bea Broke', 'Spandau', 30);
    const waiter = await student('Willi Waiting', 'Spandau', 1000);
    const window = [{ weekday, start: '08:00', end: '18:00' }];
    await insertWaitingListEntry(tenants, A, {
      studentId: brokeWaiter.id,
      lessonTypeId: waitType,
      preferredWindows: window,
      createdAt: new Date(Date.now() - 2 * HOUR),
    });
    await insertWaitingListEntry(tenants, A, {
      studentId: waiter.id,
      lessonTypeId: waitType,
      preferredWindows: window,
      createdAt: new Date(Date.now() - HOUR),
    });

    await publish(await cancelledLesson(canceller.id, ina, start, waitType));

    const offers = await offersAt(ina, start);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.offeredToStudentIds).toEqual([waiter.id]);
    expect(offers[0]?.offeredToStudentIds).not.toContain(areaMatch.id);
  });
});
