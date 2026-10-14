import { randomUUID } from 'node:crypto';
import { LessonBooked, LessonCancelled, LessonMoved } from '@driveos/shared';
import { type Job, type Queue, Worker } from 'bullmq';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newEvent, QueryBus } from '../../src/kernel/cqrs/index.js';
import { JobProcessors, JobQueues, QUEUES } from '../../src/kernel/jobs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { PlanNotificationMomentQuery } from '../../src/modules/messaging/index.js';
import { ReminderJobs } from '../../src/modules/scheduling/infra/reminder-jobs.js';
import { createSchoolFixture, insertLesson, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const HOUR = 3_600_000;
const TOLERANCE_MS = 5_000;

interface ReminderRow {
  user_id: string;
  channel: string;
  status: string;
  scheduled_for: Date;
  skip_after: Date;
  dedupe_key: string;
  payload: Record<string, unknown>;
}

describe('lesson reminders (worker)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let school: SchoolFixture;
  let queue: Queue;
  let studentUserId: string;
  let instructorName: string;
  let version = 1;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    queue = worker.app.get(JobQueues).queue(QUEUES.reminders);
    school = await createSchoolFixture(system);
    await system.query(`insert into school_settings (school_id) values ($1)`, [school.schoolId]);
    studentUserId = randomUUID();
    await system.query(
      `insert into users (id, full_name, locale) values ($1, 'Stella Student', 'en')`,
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
    const { rows } = await system.query<{ full_name: string }>(
      `select u.full_name from users u join memberships m on m.user_id = u.id where m.id = $1`,
      [school.instructorIds[0]],
    );
    instructorName = rows[0]?.full_name ?? '';
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  const period = (start: Date) =>
    `[${start.toISOString()}, ${new Date(start.getTime() + HOUR).toISOString()})`;

  async function book(start: Date): Promise<string> {
    const lessonId = await insertLesson(system, school, {
      instructor: school.instructorIds[0],
      student: school.studentIds[0],
      vehicle: school.vehicleIds[0],
      period: period(start),
    });
    await publish(lessonId, LessonBooked, start, 1);
    return lessonId;
  }

  async function moveRow(lessonId: string, start: Date): Promise<void> {
    version += 1;
    await system.query(`update lessons set period = $2, version = $3 where id = $1`, [
      lessonId,
      period(start),
      version,
    ]);
  }

  async function cancelRow(lessonId: string): Promise<void> {
    await system.query(
      `update lessons set status = 'cancelled', cancelled_at = now(), version = version + 1
        where id = $1`,
      [lessonId],
    );
  }

  async function publish(
    lessonId: string,
    definition: typeof LessonBooked | typeof LessonMoved | typeof LessonCancelled,
    start: Date,
    aggregateVersion: number,
    previousStart = start,
    drain = true,
  ): Promise<void> {
    const base = {
      lessonId,
      studentId: school.studentIds[0],
      instructorMembershipId: school.instructorIds[0],
      vehicleId: school.vehicleIds[0],
      lessonTypeId: school.lessonTypeId,
      creditMinutes: 60,
      start: start.toISOString(),
      end: new Date(start.getTime() + HOUR).toISOString(),
    };
    const event =
      definition === LessonBooked
        ? newEvent(LessonBooked, {
            aggregateType: 'lesson',
            aggregateId: lessonId,
            aggregateVersion,
            payload: {
              ...base,
              bookedVia: 'office',
              bookedByMembershipId: school.instructorIds[0],
            },
          })
        : definition === LessonMoved
          ? newEvent(LessonMoved, {
              aggregateType: 'lesson',
              aggregateId: lessonId,
              aggregateVersion,
              payload: {
                ...base,
                previousStart: previousStart.toISOString(),
                previousEnd: new Date(previousStart.getTime() + HOUR).toISOString(),
                previousInstructorMembershipId: school.instructorIds[0],
                previousVehicleId: school.vehicleIds[0],
                creditMinutesDelta: 0,
                movedByMembershipId: school.instructorIds[0],
              },
            })
          : newEvent(LessonCancelled, {
              aggregateType: 'lesson',
              aggregateId: lessonId,
              aggregateVersion,
              payload: {
                ...base,
                late: false,
                byRole: 'office',
                minutesRestored: 60,
                cancelledByMembershipId: school.instructorIds[0],
              },
            });
    await worker.tenant.runInTenant({ schoolId: school.schoolId, userId: null }, () =>
      worker.publisher.append([event]),
    );
    if (drain) expect((await worker.drainWorker()).failed).toBe(0);
  }

  async function remindersOf(lessonId: string): Promise<Job[]> {
    const jobs = await queue.getJobs(['delayed', 'waiting', 'active', 'completed', 'failed']);
    return jobs
      .filter((job) => job.id?.startsWith(`${lessonId}/`))
      .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
  }

  function expectDueAt(job: Job | undefined, moment: Date): void {
    expect(job).toBeDefined();
    const due = (job?.timestamp ?? 0) + (job?.delay ?? 0);
    expect(Math.abs(due - moment.getTime())).toBeLessThan(TOLERANCE_MS);
  }

  async function reminderRows(lessonId: string): Promise<ReminderRow[]> {
    const { rows } = await system.query<ReminderRow>(
      `select user_id, channel, status, scheduled_for, skip_after, dedupe_key, payload
         from notifications where template = 'lesson_reminder' and payload->>'lessonId' = $1`,
      [lessonId],
    );
    return rows;
  }

  it('registers the reminder subscriber and the reminders processor', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain('scheduling.lesson-reminders');
    expect(worker.app.get(JobProcessors).list()).toContain(QUEUES.reminders);
  });

  it('plans an advanced send moment in the school zone and quiet hours', async () => {
    const moment = await worker.tenant.runInTenant(
      { schoolId: school.schoolId, userId: null },
      () =>
        worker.app.get(QueryBus).execute(
          new PlanNotificationMomentQuery({
            timing: 'advanced',
            sendAt: new Date('2030-07-02T05:00:00Z'),
          }),
        ),
    );
    expect(moment).toEqual(new Date('2030-07-01T19:59:00Z'));
  });

  it('schedules the 24 h and 2 h reminders of a booked lesson', async () => {
    const start = new Date('2030-03-12T14:00:00Z');
    const lessonId = await book(start);
    const jobs = await remindersOf(lessonId);
    expect(jobs.map((job) => job.id)).toEqual([`${lessonId}/24h`, `${lessonId}/2h`]);
    expectDueAt(jobs[0], new Date('2030-03-11T14:00:00Z'));
    expectDueAt(jobs[1], new Date('2030-03-12T12:00:00Z'));
    expect(jobs[1]?.data).toEqual({
      schoolId: school.schoolId,
      lessonId,
      kind: '2h',
      start: start.toISOString(),
    });
  });

  it('moved lesson replaces its reminders, ignoring a stale event', async () => {
    const start = new Date('2030-03-12T15:00:00Z');
    const lessonId = await book(start);
    const moved = new Date('2030-03-13T08:00:00Z');
    await moveRow(lessonId, moved);
    await publish(lessonId, LessonMoved, moved, version, start);
    await publish(lessonId, LessonBooked, start, 1);
    const jobs = await remindersOf(lessonId);
    expect(jobs.map((job) => job.id)).toEqual([`${lessonId}/24h`, `${lessonId}/2h`]);
    expectDueAt(jobs[0], new Date('2030-03-12T08:00:00Z'));
    expectDueAt(jobs[1], new Date('2030-03-12T20:59:00Z'));
    expect(jobs.map((job) => (job.data as { start: string }).start)).toEqual([
      moved.toISOString(),
      moved.toISOString(),
    ]);
  });

  it('re-schedules a moved lesson on a later attempt while its old reminder job is running', async () => {
    const start = new Date('2030-03-15T15:00:00Z');
    const lessonId = await book(start);
    await (await queue.getJob(`${lessonId}/2h`))?.promote();
    const holder = new Worker(QUEUES.reminders, null, {
      connection: queue.opts.connection,
      prefix: queue.opts.prefix,
      autorun: false,
    });
    const token = randomUUID();
    try {
      const running = await holder.getNextJob(token);
      expect(running?.id).toBe(`${lessonId}/2h`);
      const moved = new Date('2030-03-16T08:00:00Z');
      await moveRow(lessonId, moved);
      await publish(lessonId, LessonMoved, moved, version, start, false);
      const events = worker.app.get(JobQueues).queue(QUEUES.events);
      const drained = worker.drainWorker();
      await vi.waitFor(async () => expect((await events.getJobCounts('delayed')).delayed).toBe(1), {
        timeout: 10_000,
        interval: 50,
      });
      await running?.moveToCompleted('done', token, false);
      const result = await drained;
      expect(result.failed).toBeGreaterThanOrEqual(1);
      const jobs = await remindersOf(lessonId);
      expect(jobs.map((job) => job.id)).toEqual([`${lessonId}/24h`, `${lessonId}/2h`]);
      expect(jobs.map((job) => (job.data as { start: string }).start)).toEqual([
        moved.toISOString(),
        moved.toISOString(),
      ]);
      const { rows } = await system.query(
        `select 1 from dead_letters where subscriber = 'scheduling.lesson-reminders'`,
      );
      expect(rows).toEqual([]);
    } finally {
      await holder.close();
    }
  });

  it('removes the reminders of a cancelled lesson', async () => {
    const start = new Date('2030-03-14T10:00:00Z');
    const lessonId = await book(start);
    expect(await remindersOf(lessonId)).toHaveLength(2);
    await cancelRow(lessonId);
    await publish(lessonId, LessonCancelled, start, 2);
    expect(await remindersOf(lessonId)).toEqual([]);
  });

  it('skips reminders whose moment has already passed', async () => {
    const start = new Date(Math.floor((Date.now() + 90 * 60_000) / 60_000) * 60_000);
    const lessonId = await book(start);
    expect(await remindersOf(lessonId)).toEqual([]);
  });

  it('sends a due reminder at 20:59 the evening before an 08:00 lesson', async () => {
    const start = new Date('2030-01-15T08:00:00Z');
    const lessonId = await insertLesson(system, school, {
      instructor: school.instructorIds[0],
      student: school.studentIds[0],
      vehicle: school.vehicleIds[0],
      period: period(start),
    });
    const data = { schoolId: school.schoolId, lessonId, kind: '2h', start: start.toISOString() };
    await worker.app.get(ReminderJobs).run(data);
    await worker.app.get(ReminderJobs).run(data);
    expect(await reminderRows(lessonId)).toEqual([
      {
        user_id: studentUserId,
        channel: 'push',
        status: 'scheduled',
        scheduled_for: new Date('2030-01-14T20:59:00Z'),
        skip_after: start,
        dedupe_key: `${lessonId}/2h/${start.toISOString()}`,
        payload: { lessonId, start: start.toISOString(), instructorName },
      },
    ]);
  });

  it('sends nothing for a lesson cancelled or moved since the job was scheduled', async () => {
    const start = new Date('2030-01-16T08:00:00Z');
    const cancelled = await insertLesson(system, school, {
      instructor: school.instructorIds[0],
      student: school.studentIds[0],
      vehicle: school.vehicleIds[0],
      period: period(start),
      status: 'cancelled',
    });
    const moved = await insertLesson(system, school, {
      instructor: school.instructorIds[0],
      student: school.studentIds[0],
      vehicle: school.vehicleIds[0],
      period: period(new Date('2030-01-17T08:00:00Z')),
    });
    for (const lessonId of [cancelled, moved, randomUUID()]) {
      await worker.app
        .get(ReminderJobs)
        .run({ schoolId: school.schoolId, lessonId, kind: '24h', start: start.toISOString() });
      expect(await reminderRows(lessonId)).toEqual([]);
    }
  });
});
