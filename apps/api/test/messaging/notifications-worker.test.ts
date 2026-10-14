import { randomUUID } from 'node:crypto';
import {
  DeviceTokenInvalidated,
  GuardianLinked,
  InvitationCreated,
  InvoiceIssued,
  LessonBooked,
  LessonCancelled,
  MessageSent,
} from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommandBus, newEvent } from '../../src/kernel/cqrs/index.js';
import { ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { SendNotificationCommand } from '../../src/modules/messaging/index.js';
import { NotificationClock } from '../../src/modules/messaging/infra/notification-clock.js';
import { NotificationDispatchJob } from '../../src/modules/messaging/infra/notification-dispatch.job.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

interface NotificationRow {
  id: string;
  user_id: string | null;
  address: string | null;
  channel: string;
  template: string;
  status: string;
  scheduled_for: Date;
  last_error: string | null;
}

const HOUR = 3_600_000;

describe('notifications (worker)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let school: SchoolFixture;
  let studentUserId: string;
  let current = new Date('2026-07-01T12:00:00Z');
  const clock = { now: () => current };

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db, [], {}, [
      { provide: NotificationClock, useValue: clock },
    ]);
    school = await createSchoolFixture(system);
    await system.query(`insert into school_settings (school_id) values ($1)`, [school.schoolId]);
    studentUserId = randomUUID();
    await system.query(
      `insert into users (id, full_name, locale, phone, email)
       values ($1, 'Stella Student', 'en', '+447700900001', 'stella@example.com')`,
      [studentUserId],
    );
    await system.query(
      `insert into memberships (id, school_id, user_id, roles, status)
       values ($1, $2, $3, '{student}', 'active')`,
      [randomUUID(), school.schoolId, studentUserId],
    );
    await system.query(`update students set user_id = $1 where id = $2`, [
      studentUserId,
      school.studentIds[0],
    ]);
    await system.query(
      `insert into devices (id, user_id, platform, push_token, locale, last_seen_at)
       values ($1, $2, 'ios', 'ExponentPushToken[stella]', 'en', now())`,
      [randomUUID(), studentUserId],
    );
  }, 60_000);

  beforeEach(() => {
    worker.push.clear();
    worker.sms.clear();
    worker.email.clear();
  });

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  const rowsOf = async (template: string) =>
    (
      await system.query<NotificationRow>(
        `select id, user_id, address, channel, template, status, scheduled_for, last_error
           from notifications where template = $1 order by channel::text, scheduled_for`,
        [template],
      )
    ).rows;

  async function publish(
    events: Parameters<WorkerTestHarness['publisher']['append']>[0],
    userId: string | null = null,
  ) {
    await worker.tenant.runInTenant({ schoolId: school.schoolId, userId }, () =>
      worker.publisher.append(events),
    );
    expect((await worker.drainWorker()).failed).toBe(0);
  }

  it('registers the notification subscribers and the dispatch job', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toEqual(
      expect.arrayContaining([
        'messaging.invitation-notifications',
        'messaging.lesson-notifications',
        'messaging.billing-notifications',
        'messaging.contract-notifications',
        'messaging.chat-notifications',
        'messaging.slot-offer-notifications',
        'messaging.growth-report-notifications',
        'messaging.guardian-consent-notifications',
      ]),
    );
    expect(worker.app.get(ScheduledJobs).list()).toContainEqual(
      expect.objectContaining({ name: 'messaging.notification-dispatch', every: 30_000 }),
    );
  });

  it('defers an invoice push issued at 22:00 to 08:00 but sends the email at once', async () => {
    current = new Date('2026-07-01T21:00:00Z');
    const invoiceId = randomUUID();
    await publish([
      newEvent(InvoiceIssued, {
        aggregateType: 'invoice',
        aggregateId: invoiceId,
        aggregateVersion: 1,
        payload: {
          invoiceId,
          studentId: school.studentIds[0],
          kind: 'invoice',
          series: '2026',
          number: 7,
          totalMinor: 12_500,
          currency: 'GBP',
          issuedAt: current.toISOString(),
          payerUserIds: [studentUserId, randomUUID()],
        },
      }),
    ]);
    const rows = await rowsOf('invoice_issued');
    expect(rows.map((r) => [r.user_id, r.channel, r.status, r.scheduled_for])).toEqual([
      [studentUserId, 'email', 'scheduled', current],
      [studentUserId, 'push', 'scheduled', new Date('2026-07-02T07:00:00Z')],
    ]);
  });

  it('advances a 2 h reminder for an 08:00 lesson to 20:59 the evening before', async () => {
    current = new Date('2026-07-01T12:00:00Z');
    const lessonStart = new Date('2026-07-02T07:00:00Z');
    const result = await worker.tenant.runInTenant(
      { schoolId: school.schoolId, userId: null },
      () =>
        worker.app.get(CommandBus).execute(
          new SendNotificationCommand({
            recipients: { userIds: [studentUserId] },
            template: 'lesson_reminder',
            payload: {
              lessonId: randomUUID(),
              start: lessonStart.toISOString(),
              instructorName: 'Ingo',
            },
            timing: 'advanced',
            sendAt: new Date(lessonStart.getTime() - 2 * HOUR),
            skipAfter: lessonStart,
            dedupeKey: 'lesson:2h',
          }),
        ),
    );
    expect(result.notificationIds).toHaveLength(1);
    const rows = await rowsOf('lesson_reminder');
    expect(rows.map((r) => [r.channel, r.status, r.scheduled_for])).toEqual([
      ['push', 'scheduled', new Date('2026-07-01T19:59:00Z')],
    ]);
  });

  it("doesn't hold a cancellation by the school of a lesson starting in 3 h, but defers a later one", async () => {
    current = new Date('2026-07-01T21:30:00Z');
    const cancelled = (start: Date) => {
      const lessonId = randomUUID();
      return newEvent(LessonCancelled, {
        aggregateType: 'lesson',
        aggregateId: lessonId,
        aggregateVersion: 2,
        payload: {
          lessonId,
          studentId: school.studentIds[0],
          instructorMembershipId: school.instructorIds[0],
          vehicleId: null,
          lessonTypeId: school.lessonTypeId,
          creditMinutes: 60,
          start: start.toISOString(),
          end: new Date(start.getTime() + HOUR).toISOString(),
          late: false,
          byRole: 'office',
          minutesRestored: 60,
          cancelledByMembershipId: school.instructorIds[0],
        },
      });
    };
    await publish(
      [
        cancelled(new Date(current.getTime() + 3 * HOUR)),
        cancelled(new Date(current.getTime() + 48 * HOUR)),
      ],
      school.ownerUserId,
    );
    const rows = await rowsOf('lesson_cancelled');
    expect(rows.map((r) => [r.user_id, r.channel, r.status, r.scheduled_for])).toEqual([
      [studentUserId, 'push', 'scheduled', current],
      [studentUserId, 'push', 'scheduled', new Date('2026-07-02T07:00:00Z')],
    ]);
  });

  it('emails a lesson booking to a student who has no device', async () => {
    current = new Date('2026-07-01T14:00:00Z');
    const userId = randomUUID();
    await system.query(
      `insert into users (id, full_name, locale, email) values ($1, 'Nora Nodevice', 'en', 'nora@example.com')`,
      [userId],
    );
    await system.query(
      `insert into memberships (id, school_id, user_id, roles, status)
       values ($1, $2, $3, '{student}', 'active')`,
      [randomUUID(), school.schoolId, userId],
    );
    await system.query(`update students set user_id = $1 where id = $2`, [
      userId,
      school.studentIds[1],
    ]);
    const lessonId = randomUUID();
    const start = new Date('2026-07-03T09:00:00Z');
    await publish(
      [
        newEvent(LessonBooked, {
          aggregateType: 'lesson',
          aggregateId: lessonId,
          aggregateVersion: 1,
          payload: {
            lessonId,
            studentId: school.studentIds[1],
            instructorMembershipId: school.instructorIds[0],
            vehicleId: null,
            lessonTypeId: school.lessonTypeId,
            creditMinutes: 60,
            start: start.toISOString(),
            end: new Date(start.getTime() + HOUR).toISOString(),
            bookedVia: 'office',
            bookedByMembershipId: school.instructorIds[0],
          },
        }),
      ],
      school.ownerUserId,
    );
    expect((await rowsOf('lesson_booked')).map((r) => [r.user_id, r.channel, r.status])).toEqual([
      [userId, 'email', 'scheduled'],
    ]);
  });

  it('sends a chat push at once, even at night', async () => {
    current = new Date('2026-07-01T23:00:00Z');
    await publish([
      newEvent(MessageSent, {
        aggregateType: 'message',
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        payload: {
          messageId: randomUUID(),
          conversationId: randomUUID(),
          conversationKind: 'student_school',
          senderUserId: school.ownerUserId,
          recipientUserIds: [studentUserId],
          preview: 'See you tomorrow',
          sentAt: current.toISOString(),
        },
      }),
    ]);
    expect((await rowsOf('message_received')).map((r) => [r.channel, r.scheduled_for])).toEqual([
      ['push', current],
    ]);
  });

  it('dispatches due notifications: sent, skipped without a device, skipped once expired', async () => {
    current = new Date('2026-07-02T10:00:00Z');
    const invitationId = randomUUID();
    await publish([
      newEvent(InvitationCreated, {
        aggregateType: 'invitation',
        aggregateId: invitationId,
        aggregateVersion: 1,
        payload: {
          invitationId,
          schoolId: school.schoolId,
          roles: ['student'],
          phone: '+447700900099',
          email: null,
          studentId: school.studentIds[1],
          invitedBy: school.ownerUserId,
          expiresAt: new Date(current.getTime() + 72 * HOUR).toISOString(),
          acceptToken: 'tok-123',
        },
      }),
    ]);
    const send = (input: ConstructorParameters<typeof SendNotificationCommand>[0]) =>
      worker.tenant.runInTenant({ schoolId: school.schoolId, userId: null }, () =>
        worker.app.get(CommandBus).execute(new SendNotificationCommand(input)),
      );
    const contract = { contractId: randomUUID() };
    const [noDevice] = (
      await send({
        recipients: { userIds: [school.ownerUserId] },
        template: 'contract_created',
        payload: contract,
        timing: 'immediate',
        channels: ['push'],
      })
    ).notificationIds;
    const [expiring] = (
      await send({
        recipients: { userIds: [studentUserId] },
        template: 'contract_created',
        payload: contract,
        timing: 'immediate',
        channels: ['push'],
        skipAfter: new Date(current.getTime() + 60_000),
      })
    ).notificationIds;

    current = new Date(current.getTime() + 5 * 60_000);
    const summary = await worker.app.get(NotificationDispatchJob).dispatch(current);
    expect(summary.failed).toEqual([]);

    const status = async (id: string | undefined) =>
      (
        await system.query<{ status: string; last_error: string | null }>(
          `select status, last_error from notifications where id = $1`,
          [id],
        )
      ).rows[0];
    expect(await status(noDevice)).toEqual({ status: 'skipped', last_error: 'no_device' });
    expect(await status(expiring)).toEqual({ status: 'skipped', last_error: 'expired' });

    const [invitation] = await rowsOf('invitation');
    expect(invitation).toMatchObject({ user_id: null, address: '+447700900099', status: 'sent' });
    expect(worker.sms.sent).toEqual([
      {
        to: '+447700900099',
        body: 'Fixture School invited you to DriveOS. Accept here: http://localhost:15173/invitations/tok-123',
      },
    ]);

    const pushed = worker.push.sent.map((p) => [p.token, p.title, p.body]);
    expect(pushed).toContainEqual([
      'ExponentPushToken[stella]',
      'Lesson cancelled',
      expect.stringContaining('was cancelled'),
    ]);
    expect(pushed).toContainEqual([
      'ExponentPushToken[stella]',
      'User ' + school.ownerUserId,
      'See you tomorrow',
    ]);
    expect(worker.email.sent).toContainEqual(
      expect.objectContaining({
        to: 'stella@example.com',
        subject: 'Invoice 2026-000007 from Fixture School',
      }),
    );
    expect((await rowsOf('lesson_cancelled')).map((r) => [r.status, r.last_error]).sort()).toEqual([
      ['sent', null],
      ['skipped', 'expired'],
    ]);

    const again = await worker.app.get(NotificationDispatchJob).dispatch(current);
    expect(again.failed).toEqual([]);
    expect(worker.sms.sent).toHaveLength(1);
  });
  it('prunes a device whose push token the provider rejects, unless it re-registered since', async () => {
    current = new Date('2026-07-03T10:00:00Z');
    const userId = randomUUID();
    await system.query(
      `insert into users (id, full_name, locale) values ($1, 'Dora Device', 'en')`,
      [userId],
    );
    await system.query(
      `insert into memberships (id, school_id, user_id, roles, status)
       values ($1, $2, $3, '{student}', 'active')`,
      [randomUUID(), school.schoolId, userId],
    );
    const device = async (token: string) => {
      const id = randomUUID();
      await system.query(
        `insert into devices (id, user_id, platform, push_token, locale, last_seen_at)
         values ($1, $2, 'android', $3, 'en', now() - interval '1 day')`,
        [id, userId, token],
      );
      return id;
    };
    const dead = await device(`ExponentPushToken[dead-${userId}]`);
    const reRegistered = await device(`ExponentPushToken[back-${userId}]`);
    const live = await device(`ExponentPushToken[live-${userId}]`);
    worker.push.invalidTokens.add(`ExponentPushToken[dead-${userId}]`);
    worker.push.invalidTokens.add(`ExponentPushToken[back-${userId}]`);
    await worker.tenant.runInTenant({ schoolId: school.schoolId, userId: null }, () =>
      worker.app.get(CommandBus).execute(
        new SendNotificationCommand({
          recipients: { userIds: [userId] },
          template: 'contract_created',
          payload: { contractId: randomUUID() },
          timing: 'immediate',
          channels: ['push'],
        }),
      ),
    );

    const summary = await worker.app.get(NotificationDispatchJob).dispatch(current);
    expect(summary.failed).toEqual([]);
    const events = await expectEvents(db, { type: DeviceTokenInvalidated });
    expect(events.map((event) => event.payload.deviceId).sort()).toEqual(
      [dead, reRegistered].sort(),
    );
    expect(events.every((event) => event.payload.userId === userId)).toBe(true);
    await system.query(
      `update devices set last_seen_at = now() + interval '1 minute' where id = $1`,
      [reRegistered],
    );
    expect((await worker.drainWorker()).failed).toBe(0);
    expect((await worker.drainWorker()).failed).toBe(0);

    const { rows } = await system.query<{ id: string }>(
      `select id from devices where user_id = $1 order by id`,
      [userId],
    );
    expect(rows.map((row) => row.id)).toEqual([reRegistered, live].sort());
  });

  it('asks a guardian for consent: email at once, push after quiet hours, with the consent link', async () => {
    current = new Date('2026-07-01T21:00:00Z');
    const guardianUserId = randomUUID();
    await system.query(
      `insert into users (id, full_name, locale, phone, email)
       values ($1, 'Gustav Guardian', 'en', '+447700900002', 'gustav@example.com')`,
      [guardianUserId],
    );
    await system.query(
      `insert into memberships (id, school_id, user_id, roles, status)
       values ($1, $2, $3, '{parent}', 'active')`,
      [randomUUID(), school.schoolId, guardianUserId],
    );
    await system.query(
      `insert into devices (id, user_id, platform, push_token, locale, last_seen_at)
       values ($1, $2, 'ios', 'ExponentPushToken[gustav]', 'en', now())`,
      [randomUUID(), guardianUserId],
    );
    const studentId = school.studentIds[0] as string;
    const linked = (consentRequired: boolean) => {
      const guardianLinkId = randomUUID();
      return {
        guardianLinkId,
        event: newEvent(GuardianLinked, {
          aggregateType: 'student',
          aggregateId: studentId,
          aggregateVersion: 3,
          payload: {
            guardianLinkId,
            studentId,
            guardianUserId,
            studentUserId: null,
            consentRequired,
          },
        }),
      };
    };
    const minor = linked(true);
    const adult = linked(false);
    await publish([minor.event, adult.event]);

    const rows = await rowsOf('guardian_consent_requested');
    expect(rows.map((r) => [r.user_id, r.channel, r.status, r.scheduled_for])).toEqual([
      [guardianUserId, 'email', 'scheduled', current],
      [guardianUserId, 'push', 'scheduled', new Date('2026-07-02T07:00:00Z')],
    ]);

    await worker.app.get(NotificationDispatchJob).dispatch(current);
    const url = `http://localhost:15173/parent/consent/${minor.guardianLinkId}`;
    expect(worker.email.sent).toContainEqual(
      expect.objectContaining({
        to: 'gustav@example.com',
        subject: 'Fixture School asks for your consent',
        text: expect.stringContaining(url),
      }),
    );
    expect(worker.push.sent.map((p) => p.token)).not.toContain('ExponentPushToken[gustav]');

    current = new Date('2026-07-02T07:01:00Z');
    await worker.app.get(NotificationDispatchJob).dispatch(current);
    expect(worker.push.sent).toContainEqual(
      expect.objectContaining({
        token: 'ExponentPushToken[gustav]',
        title: 'Consent needed',
        data: expect.objectContaining({
          template: 'guardian_consent_requested',
          guardianLinkId: minor.guardianLinkId,
        }),
      }),
    );
  });
});
