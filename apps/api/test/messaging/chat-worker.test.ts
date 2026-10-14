import { randomUUID } from 'node:crypto';
import { InstructorAssigned, StudentCreated } from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newEvent } from '../../src/kernel/cqrs/index.js';
import { newId } from '../../src/kernel/db/columns.js';
import { ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { ChatRetentionJob } from '../../src/modules/messaging/infra/chat-retention.job.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const DAY_MS = 86_400_000;

describe('messaging worker', () => {
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
    await system.query(
      `insert into school_settings (school_id, chat_retention_months) values ($1, 6), ($2, 24)`,
      [school.schoolId, other.schoolId],
    );
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  const conversationsOf = async (studentId: string) =>
    (
      await system.query<{ kind: string; instructor_membership_id: string | null }>(
        `select kind, instructor_membership_id from conversations where student_id = $1 order by kind`,
        [studentId],
      )
    ).rows;

  function publish(events: Parameters<WorkerTestHarness['publisher']['append']>[0]) {
    return worker.tenant.runInTenant({ schoolId: school.schoolId, userId: null }, () =>
      worker.publisher.append(events),
    );
  }

  const studentCreated = (studentId: string) =>
    newEvent(StudentCreated, {
      aggregateType: 'student',
      aggregateId: studentId,
      aggregateVersion: 1,
      payload: {
        studentId,
        userId: null,
        fullName: 'Stella Student',
        licenceClass: 'B',
        examLanguage: 'en',
        testDate: null,
        area: null,
        status: 'active',
      },
    });

  const instructorAssigned = (studentId: string, instructorMembershipId: string) =>
    newEvent(InstructorAssigned, {
      aggregateType: 'student',
      aggregateId: studentId,
      aggregateVersion: 2,
      payload: {
        assignmentId: randomUUID(),
        studentId,
        instructorMembershipId,
        instructorName: 'Ingo Instructor',
        isPrimary: true,
        assignedAt: new Date().toISOString(),
      },
    });

  it('registers the conversation subscriber and the nightly retention job', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain('messaging.conversations');
    expect(
      worker.app
        .get(ScheduledJobs)
        .list()
        .map((job) => job.name),
    ).toContain('messaging.chat-retention');
  });

  it('opens one school chat per student and one instructor chat per assignment, idempotently', async () => {
    const [studentId] = school.studentIds;
    const [first, second] = school.instructorIds;
    await publish([studentCreated(studentId), instructorAssigned(studentId, first)]);
    await publish([
      studentCreated(studentId),
      instructorAssigned(studentId, first),
      instructorAssigned(studentId, second),
    ]);
    expect((await worker.drainWorker()).failed).toBe(0);
    const rows = await conversationsOf(studentId);
    expect(rows.filter((row) => row.kind === 'student_school')).toHaveLength(1);
    expect(
      rows
        .filter((row) => row.kind === 'student_instructor')
        .map((row) => row.instructor_membership_id)
        .sort(),
    ).toEqual([first, second].sort());
  });

  it("deletes messages older than the school's retention and clears read pointers to them", async () => {
    const studentId = school.studentIds[1];
    const conversationId = newId();
    await system.query(
      `insert into conversations (id, school_id, kind, student_id) values ($1, $2, 'student_school', $3)`,
      [conversationId, school.schoolId, studentId],
    );
    const insertMessage = async (schoolId: string, convId: string, sentAt: Date) => {
      const id = newId();
      await system.query(
        `insert into messages (id, school_id, conversation_id, sender_user_id, body, sent_at)
         values ($1, $2, $3, $4, 'Hello', $5)`,
        [id, schoolId, convId, school.ownerUserId, sentAt],
      );
      return id;
    };
    const now = Date.now();
    const old = await insertMessage(school.schoolId, conversationId, new Date(now - 200 * DAY_MS));
    const recent = await insertMessage(school.schoolId, conversationId, new Date(now - DAY_MS));
    await system.query(
      `insert into conversation_members (id, school_id, conversation_id, membership_id, last_read_message_id)
       values ($1, $2, $3, $4, $5)`,
      [newId(), school.schoolId, conversationId, school.instructorIds[0], old],
    );
    const otherConversation = newId();
    await system.query(
      `insert into conversations (id, school_id, kind, student_id) values ($1, $2, 'student_school', $3)`,
      [otherConversation, other.schoolId, other.studentIds[0]],
    );
    const otherOld = await insertMessage(
      other.schoolId,
      otherConversation,
      new Date(now - 200 * DAY_MS),
    );

    const summary = await worker.app.get(ChatRetentionJob).purge();
    expect(summary.failed).toEqual([]);

    const left = await system.query<{ id: string }>(
      `select id from messages where id = any($1::uuid[]) order by id`,
      [[old, recent, otherOld]],
    );
    expect(left.rows.map((row) => row.id).sort()).toEqual([recent, otherOld].sort());
    const pointer = await system.query<{ last_read_message_id: string | null }>(
      `select last_read_message_id from conversation_members where conversation_id = $1`,
      [conversationId],
    );
    expect(pointer.rows).toEqual([{ last_read_message_id: null }]);
  });
});
