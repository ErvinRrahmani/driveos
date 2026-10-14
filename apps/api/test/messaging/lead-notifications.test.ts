import { randomUUID } from 'node:crypto';
import { LeadCaptured } from '@driveos/shared';
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
  scheduled_for: Date;
  payload: Record<string, unknown>;
}

describe('lead notifications (worker)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let current = new Date('2026-07-01T12:00:00Z');
  const clock = { now: () => current };

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db, [], {}, [
      { provide: NotificationClock, useValue: clock },
    ]);
  }, 60_000);

  beforeEach(() => {
    current = new Date('2026-07-01T12:00:00Z');
    worker.push.clear();
    worker.email.clear();
  });

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  async function user(
    school: SchoolFixture,
    input: { name: string; roles: string[]; status?: string; email?: string; device?: boolean },
  ): Promise<string> {
    const userId = randomUUID();
    await system.query(
      `insert into users (id, full_name, locale, email) values ($1, $2, 'en', $3)`,
      [userId, input.name, input.email ?? null],
    );
    await system.query(
      `insert into memberships (id, school_id, user_id, roles, status) values ($1, $2, $3, $4, $5)`,
      [randomUUID(), school.schoolId, userId, input.roles, input.status ?? 'active'],
    );
    if (input.device) {
      await system.query(
        `insert into devices (id, user_id, platform, push_token, locale, last_seen_at)
         values ($1, $2, 'ios', $3, 'en', now())`,
        [randomUUID(), userId, `ExponentPushToken[${userId}]`],
      );
    }
    return userId;
  }

  async function staffedSchool() {
    const school = await createSchoolFixture(system);
    const tag = school.schoolId.slice(0, 8);
    await system.query(`insert into school_settings (school_id) values ($1)`, [school.schoolId]);
    const owner = await user(school, {
      name: 'Olga Owner',
      roles: ['owner'],
      email: `olga-${tag}@example.com`,
    });
    const office = await user(school, {
      name: 'Otto Office',
      roles: ['office'],
      email: `otto-${tag}@example.com`,
      device: true,
    });
    const both = await user(school, { name: 'Bea Both', roles: ['owner', 'office'], device: true });
    const disabled = await user(school, {
      name: 'Dino Disabled',
      roles: ['office'],
      status: 'disabled',
      device: true,
    });
    const instructor = await user(school, {
      name: 'Ida Instructor',
      roles: ['instructor'],
      device: true,
    });
    return { school, tag, owner, office, both, disabled, instructor };
  }

  function captured(fullName = 'Lena Learner') {
    const leadId = randomUUID();
    return newEvent(LeadCaptured, {
      aggregateType: 'lead',
      aggregateId: leadId,
      aggregateVersion: 1,
      payload: {
        leadId,
        source: 'page',
        licenceClass: 'B',
        isMinor: false,
        fullName,
        capturedAt: current.toISOString(),
      },
    });
  }

  async function publish(
    school: SchoolFixture,
    event: NewDomainEvent,
    userId: string | null = null,
  ): Promise<DomainEvent> {
    const [appended] = await worker.tenant.runInTenant({ schoolId: school.schoolId, userId }, () =>
      worker.publisher.append([event]),
    );
    expect((await worker.drainWorker()).failed).toBe(0);
    if (!appended) throw new Error('event not appended');
    return appended;
  }

  const rowsOf = async (school: SchoolFixture) =>
    (
      await system.query<NotificationRow>(
        `select user_id, channel, status, scheduled_for, payload from notifications
          where school_id = $1 and template = 'lead_captured' order by id`,
        [school.schoolId],
      )
    ).rows;

  it('registers the lead notification subscriber', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain('messaging.lead-notifications');
  });

  it('notifies every active owner and office member once: push, or email without a device', async () => {
    const staff = await staffedSchool();
    const event = captured();
    await publish(staff.school, event);

    const rows = await rowsOf(staff.school);
    expect(rows.map((r) => `${r.user_id}:${r.channel}`).sort()).toEqual(
      [
        `${staff.school.ownerUserId}:email`,
        `${staff.owner}:email`,
        `${staff.office}:push`,
        `${staff.both}:push`,
      ].sort(),
    );
    expect(rows.every((r) => r.status === 'scheduled' && +r.scheduled_for === +current)).toBe(true);
    expect(rows[0]?.payload).toEqual({
      leadId: event.payload.leadId,
      fullName: 'Lena Learner',
      licenceClass: 'B',
    });

    await worker.app.get(NotificationDispatchJob).dispatch(current);
    expect(worker.push.sent).toContainEqual(
      expect.objectContaining({
        token: `ExponentPushToken[${staff.office}]`,
        title: 'New enquiry',
        body: 'Lena Learner asked about a class B licence.',
        data: expect.objectContaining({
          template: 'lead_captured',
          leadId: event.payload.leadId,
        }),
      }),
    );
    expect(worker.push.sent.map((p) => p.token)).not.toContain(
      `ExponentPushToken[${staff.disabled}]`,
    );
    expect(worker.push.sent.map((p) => p.token)).not.toContain(
      `ExponentPushToken[${staff.instructor}]`,
    );
    expect(worker.email.sent).toContainEqual(
      expect.objectContaining({
        to: `olga-${staff.tag}@example.com`,
        subject: 'New enquiry from Lena Learner',
        text: expect.stringContaining('class B licence through the Fixture School page'),
      }),
    );
  });

  it('writes nothing more when the same event is delivered again', async () => {
    const staff = await staffedSchool();
    const event = await publish(staff.school, captured());
    const before = await rowsOf(staff.school);
    expect(before).toHaveLength(4);

    await system.query('update outbox set published_at = null where id = $1', [event.id]);
    const again = await worker.drainWorker();
    expect(again).toMatchObject({ relayed: 1, failed: 0 });
    expect(await rowsOf(staff.school)).toEqual(before);
  });

  it('does not notify the staff member who entered the lead', async () => {
    const staff = await staffedSchool();
    await publish(staff.school, captured('Manual Mia'), staff.office);
    const rows = await rowsOf(staff.school);
    expect(rows.map((r) => r.user_id)).not.toContain(staff.office);
    expect(rows).toHaveLength(3);
  });

  it('holds the push until quiet hours end but emails at once', async () => {
    current = new Date('2026-07-01T22:30:00Z');
    const staff = await staffedSchool();
    await publish(staff.school, captured());
    const rows = await rowsOf(staff.school);
    const at = (userId: string) => rows.find((r) => r.user_id === userId)?.scheduled_for;
    expect(at(staff.owner)).toEqual(current);
    expect(at(staff.office)).toEqual(new Date('2026-07-02T07:00:00Z'));
  });
});
