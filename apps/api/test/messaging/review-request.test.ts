import { randomUUID } from 'node:crypto';
import { TestAttemptRecorded, type TestAttemptKind, type TestAttemptResult } from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type DomainEvent, type NewDomainEvent, newEvent } from '../../src/kernel/cqrs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { NotificationClock } from '../../src/modules/messaging/infra/notification-clock.js';
import { NotificationDispatchJob } from '../../src/modules/messaging/infra/notification-dispatch.job.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

interface NotificationRow {
  user_id: string | null;
  channel: string;
  status: string;
  payload: Record<string, unknown>;
}

const REVIEW_URL = 'driveos://student/review';
const EXTERNAL_URL = 'https://g.page/r/fixture-school/review';

describe('review request (worker)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  const current = new Date('2026-07-01T12:00:00Z');
  const clock = { now: () => current };
  const planId = randomUUID();

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    await system.query(
      `insert into plans (id, code, name, base_amount_minor, student_fee_minor, currency, active, features)
       values ($1, 'review-pro', 'Pro', 9900, 300, 'EUR', true, '{enrolment_page}')`,
      [planId],
    );
    worker = await createWorkerTestHarness(db, [], {}, [
      { provide: NotificationClock, useValue: clock },
    ]);
  }, 60_000);

  beforeEach(() => {
    worker.push.clear();
    worker.email.clear();
  });

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  async function school(
    externalReviewUrl: string | null | 'no profile',
    { feature = true }: { feature?: boolean } = {},
  ) {
    const fixture = await createSchoolFixture(system);
    await system.query(`insert into school_settings (school_id) values ($1)`, [fixture.schoolId]);
    if (feature) {
      await system.query(
        `insert into subscriptions (id, school_id, plan_id, started_at)
         values ($1, $2, $3, '2026-01-01T00:00:00Z')`,
        [randomUUID(), fixture.schoolId, planId],
      );
    }
    if (externalReviewUrl !== 'no profile') {
      await system.query(
        `insert into school_public_profiles (school_id, slug, external_review_url)
         values ($1, $2, $3)`,
        [fixture.schoolId, `school-${fixture.schoolId.slice(0, 8)}`, externalReviewUrl],
      );
    }
    return fixture;
  }

  async function studentLogin(
    fixture: SchoolFixture,
    studentId: string,
    device: boolean,
  ): Promise<{ userId: string; email: string }> {
    const userId = randomUUID();
    const email = `student-${userId}@example.com`;
    await system.query(
      `insert into users (id, full_name, locale, email) values ($1, 'Sami Student', 'en', $2)`,
      [userId, email],
    );
    await system.query(
      `insert into memberships (id, school_id, user_id, roles, status)
       values ($1, $2, $3, '{student}', 'active')`,
      [randomUUID(), fixture.schoolId, userId],
    );
    await system.query(`update students set user_id = $1 where id = $2`, [userId, studentId]);
    if (device) {
      await system.query(
        `insert into devices (id, user_id, platform, push_token, locale, last_seen_at)
         values ($1, $2, 'android', $3, 'en', now())`,
        [randomUUID(), userId, `ExponentPushToken[${userId}]`],
      );
    }
    return { userId, email };
  }

  function attempt(
    studentId: string,
    kind: TestAttemptKind = 'practical',
    result: TestAttemptResult = 'passed',
  ) {
    const testAttemptId = randomUUID();
    return newEvent(TestAttemptRecorded, {
      aggregateType: 'student',
      aggregateId: studentId,
      aggregateVersion: 5,
      payload: { testAttemptId, studentId, kind, takenOn: '2026-07-01', result },
    });
  }

  async function publish(fixture: SchoolFixture, events: NewDomainEvent[]): Promise<DomainEvent[]> {
    const appended = await worker.tenant.runInTenant(
      { schoolId: fixture.schoolId, userId: null },
      () => worker.publisher.append(events),
    );
    expect((await worker.drainWorker()).failed).toBe(0);
    return appended;
  }

  const rowsOf = async (fixture: SchoolFixture) =>
    (
      await system.query<NotificationRow>(
        `select user_id, channel, status, payload from notifications
          where school_id = $1 and template = 'review_request' order by id`,
        [fixture.schoolId],
      )
    ).rows;

  it('registers the review request subscriber', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain('messaging.review-request');
  });

  it('pushes the review deep link to a student who passed the practical test', async () => {
    const fixture = await school(EXTERNAL_URL);
    const studentId = fixture.studentIds[0];
    const { userId } = await studentLogin(fixture, studentId, true);
    await publish(fixture, [attempt(studentId)]);

    expect(await rowsOf(fixture)).toEqual([
      {
        user_id: userId,
        channel: 'push',
        status: 'scheduled',
        payload: { studentId, url: REVIEW_URL, externalReviewUrl: EXTERNAL_URL },
      },
    ]);

    await worker.app.get(NotificationDispatchJob).dispatch(current);
    expect(worker.push.sent).toEqual([
      expect.objectContaining({
        token: `ExponentPushToken[${userId}]`,
        title: 'Congratulations!',
        body: 'You passed your driving test. Tell others how Fixture School did.',
        data: expect.objectContaining({ template: 'review_request', studentId }),
      }),
    ]);
  });

  it('emails a student without a device, with the external review link when the school set one', async () => {
    const fixture = await school(EXTERNAL_URL);
    const studentId = fixture.studentIds[0];
    const { email } = await studentLogin(fixture, studentId, false);
    await publish(fixture, [attempt(studentId)]);
    expect((await rowsOf(fixture)).map((r) => r.channel)).toEqual(['email']);

    await worker.app.get(NotificationDispatchJob).dispatch(current);
    const [mail] = worker.email.sent;
    expect(mail).toMatchObject({
      to: email,
      subject: 'Congratulations on passing! How did Fixture School do?',
    });
    expect(mail?.text).toContain(REVIEW_URL);
    expect(mail?.text).toContain(`You can also review Fixture School here: ${EXTERNAL_URL}`);
  });

  it('leaves out the external link when the school has none or no public profile', async () => {
    for (const external of [null, 'no profile'] as const) {
      worker.email.clear();
      const fixture = await school(external);
      const studentId = fixture.studentIds[0];
      await studentLogin(fixture, studentId, false);
      await publish(fixture, [attempt(studentId)]);
      expect((await rowsOf(fixture)).map((r) => r.payload)).toEqual([
        { studentId, url: REVIEW_URL, externalReviewUrl: null },
      ]);

      await worker.app.get(NotificationDispatchJob).dispatch(current);
      const [mail] = worker.email.sent;
      expect(mail?.text).toContain(REVIEW_URL);
      expect(mail?.text).not.toContain('You can also review');
    }
  });

  it('asks once: nothing more on a redelivery or a second passed practical attempt', async () => {
    const fixture = await school(null);
    const studentId = fixture.studentIds[0];
    await studentLogin(fixture, studentId, true);
    const [first] = await publish(fixture, [attempt(studentId)]);
    const before = await rowsOf(fixture);
    expect(before).toHaveLength(1);

    await system.query('update outbox set published_at = null where id = $1', [first?.id]);
    expect(await worker.drainWorker()).toMatchObject({ relayed: 1, failed: 0 });
    expect(await rowsOf(fixture)).toEqual(before);

    await publish(fixture, [attempt(studentId)]);
    expect(await rowsOf(fixture)).toEqual(before);
  });

  it('asks nobody at a school whose plan lacks the enrolment page', async () => {
    const fixture = await school(EXTERNAL_URL, { feature: false });
    const studentId = fixture.studentIds[0];
    await studentLogin(fixture, studentId, true);
    await publish(fixture, [attempt(studentId)]);
    expect(await rowsOf(fixture)).toEqual([]);
  });

  it('skips a student without a login', async () => {
    const fixture = await school(EXTERNAL_URL);
    await publish(fixture, [attempt(fixture.studentIds[1])]);
    expect(await rowsOf(fixture)).toEqual([]);
  });

  it('skips theory attempts and failed practical attempts', async () => {
    const fixture = await school(EXTERNAL_URL);
    const studentId = fixture.studentIds[0];
    await studentLogin(fixture, studentId, true);
    await publish(fixture, [
      attempt(studentId, 'theory', 'passed'),
      attempt(studentId, 'practical', 'failed'),
    ]);
    expect(await rowsOf(fixture)).toEqual([]);
  });
});
