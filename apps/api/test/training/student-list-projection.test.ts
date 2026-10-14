import { randomUUID } from 'node:crypto';
import {
  type EventDefinition,
  InstructorAssigned,
  InstructorUnassigned,
  LedgerEntryRecorded,
  LessonBooked,
  LessonCancelled,
  LessonCompleted,
  LessonMoved,
  ProgressRecorded,
  StudentArchived,
  StudentCreated,
} from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DomainEvent, newEvent } from '../../src/kernel/cqrs/index.js';
import { newId } from '../../src/kernel/db/columns.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { progressEntries } from '../../src/modules/training/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent } from '../identity/support.js';
import { expectEvents } from '../support/events.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import {
  assignInstructor,
  createLessonRow,
  createLogin,
  createSyllabus,
  type Login,
} from './support.js';

const PROJECTION = 'training.student-list';
const HOUR_MS = 3_600_000;

interface ListRow {
  full_name: string;
  licence_class: string;
  status: string;
  primary_instructor_name: string | null;
  balance_minutes: number;
  next_lesson_at: Date | null;
  last_lesson_at: Date | null;
  progress_pct: number;
}

describe('rm_student_list projection (training.student-list)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let ingo: Login;
  let syllabus: string[];

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    tenants = await createTestTenants(db, { context: worker.tenant });
    ({ A } = tenants);
    ingo = await createLogin(tenants, A, ['instructor']);
    await system.query(`update users set full_name = 'Ingo Instructor' where id = $1`, [
      ingo.userId,
    ]);
    syllabus = await createSyllabus(tenants, A, ['B01', 'B02']);
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await tenants?.close();
    await system?.end();
    await db?.drop();
  });

  const listRow = async (studentId: string) =>
    (
      await system.query<ListRow>(
        `select full_name, licence_class, status, primary_instructor_name, balance_minutes,
                next_lesson_at, last_lesson_at, progress_pct
           from rm_student_list where student_id = $1`,
        [studentId],
      )
    ).rows[0];

  async function publish<D extends EventDefinition>(
    definition: D,
    aggregateType: string,
    aggregateId: string,
    aggregateVersion: number,
    payload: DomainEvent['payload'],
  ): Promise<void> {
    await worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
      worker.publisher.append([
        newEvent(definition, {
          aggregateType,
          aggregateId,
          aggregateVersion,
          payload: payload as never,
        }),
      ]),
    );
  }

  async function namedStudent(fullName: string): Promise<string> {
    const id = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    await system.query(`update students set full_name = $1 where id = $2`, [fullName, id]);
    return id;
  }

  const lessonPayload = (studentId: string, lessonId: string, start: Date) => ({
    lessonId,
    studentId,
    instructorMembershipId: ingo.membershipId,
    vehicleId: null,
    lessonTypeId: randomUUID(),
    creditMinutes: 60,
    start: start.toISOString(),
    end: new Date(start.getTime() + HOUR_MS).toISOString(),
  });

  let round = 0;
  async function feedLifecycle(studentId: string) {
    round += 1;
    const assignmentId = await assignInstructor(tenants, A, studentId, ingo.membershipId);
    const past = new Date(Date.now() - (48 + 3 * round) * HOUR_MS);
    const future = new Date(Date.now() + 48 * HOUR_MS);
    const later = new Date(Date.now() + 96 * HOUR_MS);
    const completedLesson = await createLessonRow(tenants, A, {
      studentId,
      instructorMembershipId: ingo.membershipId,
      start: past,
    });
    const nextLesson = randomUUID();
    const laterLesson = randomUUID();
    await tenants.asSchool(A, (tx) =>
      tx.insert(progressEntries).values([
        {
          id: newId(),
          schoolId: A.schoolId,
          lessonId: completedLesson,
          studentId,
          syllabusItemId: syllabus[0] as string,
          level: 4,
          note: '',
          version: 1,
        },
      ]),
    );
    await publish(StudentCreated, 'student', studentId, 1, {
      studentId,
      userId: null,
      fullName: 'Pia Projection',
      licenceClass: 'B',
      examLanguage: 'en',
      testDate: null,
      area: null,
      status: 'active',
    });
    await publish(InstructorAssigned, 'student', studentId, 2, {
      assignmentId,
      studentId,
      instructorMembershipId: ingo.membershipId,
      instructorName: 'Ingo Instructor',
      isPrimary: true,
      assignedAt: new Date().toISOString(),
    });
    const ledger = (version: number, minutes: number, balanceAfter: number) =>
      publish(LedgerEntryRecorded, 'student_ledger', studentId, version, {
        entryId: randomUUID(),
        studentId,
        entryType: minutes > 0 ? 'purchase' : 'debit',
        minutes,
        balanceAfter,
      });
    await ledger(1, 600, 600);
    await ledger(2, -60, 540);
    await ledger(3, -60, 480);
    await publish(LessonBooked, 'lesson', completedLesson, 1, {
      ...lessonPayload(studentId, completedLesson, past),
      bookedVia: 'office',
      bookedByMembershipId: A.ownerMembershipId,
    });
    const { vehicleId: _vehicle, ...completed } = lessonPayload(studentId, completedLesson, past);
    await publish(LessonCompleted, 'lesson', completedLesson, 2, completed);
    await publish(LessonBooked, 'lesson', nextLesson, 1, {
      ...lessonPayload(studentId, nextLesson, later),
      bookedVia: 'office',
      bookedByMembershipId: A.ownerMembershipId,
    });
    await publish(LessonMoved, 'lesson', nextLesson, 2, {
      ...lessonPayload(studentId, nextLesson, future),
      previousStart: later.toISOString(),
      previousEnd: new Date(later.getTime() + HOUR_MS).toISOString(),
      previousInstructorMembershipId: ingo.membershipId,
      previousVehicleId: null,
      creditMinutesDelta: 0,
      movedByMembershipId: A.ownerMembershipId,
    });
    await publish(LessonBooked, 'lesson', laterLesson, 1, {
      ...lessonPayload(studentId, laterLesson, later),
      bookedVia: 'office',
      bookedByMembershipId: A.ownerMembershipId,
    });
    await publish(LessonCancelled, 'lesson', laterLesson, 2, {
      ...lessonPayload(studentId, laterLesson, later),
      late: false,
      byRole: 'office',
      minutesRestored: 60,
      cancelledByMembershipId: A.ownerMembershipId,
    });
    await publish(ProgressRecorded, 'student', studentId, 3, {
      lessonId: completedLesson,
      studentId,
      instructorMembershipId: ingo.membershipId,
      entries: [
        { progressEntryId: randomUUID(), syllabusItemId: syllabus[0], level: 4, version: 1 },
      ],
    });
    return { past, future };
  }

  const expected = (past: Date, future: Date): ListRow => ({
    full_name: 'Pia Projection',
    licence_class: 'B',
    status: 'active',
    primary_instructor_name: 'Ingo Instructor',
    balance_minutes: 480,
    next_lesson_at: future,
    last_lesson_at: past,
    progress_pct: 40,
  });

  it('is registered in the worker', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain(PROJECTION);
  });

  it('builds the row from student, assignment, ledger, lesson and progress events', async () => {
    const studentId = await namedStudent('Pia Projection');
    const { past, future } = await feedLifecycle(studentId);

    const drained = await worker.drainWorker();
    expect(drained.failed).toBe(0);

    expect(await listRow(studentId)).toEqual(expected(past, future));
  });

  it('converges to the same row when every event is replayed twice, and ignores stale versions', async () => {
    const studentId = await namedStudent('Pia Projection');
    const { past, future } = await feedLifecycle(studentId);
    await worker.drainWorker();
    const settled = await listRow(studentId);
    expect(settled).toEqual(expected(past, future));

    const events = [
      ...(await expectEvents(db, { aggregateId: studentId })),
      ...(await expectEvents(db, { aggregateType: 'lesson', schoolId: A.schoolId })).filter(
        (event) => (event.payload as { studentId: string }).studentId === studentId,
      ),
    ];
    const { handler } = worker.app.get(SubscriberRegistry).get(PROJECTION);
    const replay = async () => {
      for (const event of events) {
        await worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
          handler.handle(event as DomainEvent, { subscriber: PROJECTION, attempt: 1 }),
        );
      }
    };

    await replay();
    expect(await listRow(studentId)).toEqual(settled);

    await system.query(`delete from projection_positions where projection = $1`, [PROJECTION]);
    await system.query(`update rm_student_list set balance_minutes = 0 where student_id = $1`, [
      studentId,
    ]);
    await replay();
    await replay();
    expect(await listRow(studentId)).toEqual(settled);

    await publish(LedgerEntryRecorded, 'student_ledger', studentId, 2, {
      entryId: randomUUID(),
      studentId,
      entryType: 'adjustment',
      minutes: 999,
      balanceAfter: 9999,
    });
    await worker.drainWorker();
    expect((await listRow(studentId))?.balance_minutes).toBe(480);
  });

  it('follows unassignment and archiving from the write tables', async () => {
    const studentId = await namedStudent('Ada Archive');
    const assignmentId = await assignInstructor(tenants, A, studentId, ingo.membershipId);
    await publish(InstructorAssigned, 'student', studentId, 1, {
      assignmentId,
      studentId,
      instructorMembershipId: ingo.membershipId,
      instructorName: 'Ingo Instructor',
      isPrimary: true,
      assignedAt: new Date().toISOString(),
    });
    await worker.drainWorker();
    expect((await listRow(studentId))?.primary_instructor_name).toBe('Ingo Instructor');

    await system.query(`update student_instructors set unassigned_at = now() where id = $1;`, [
      assignmentId,
    ]);
    await system.query(`update students set status = 'archived' where id = $1`, [studentId]);
    await publish(InstructorUnassigned, 'student', studentId, 2, {
      assignmentId,
      studentId,
      instructorMembershipId: ingo.membershipId,
      wasPrimary: true,
      unassignedAt: new Date().toISOString(),
    });
    await publish(StudentArchived, 'student', studentId, 3, {
      studentId,
      archivedAt: new Date().toISOString(),
      completedLessons: 0,
    });
    await worker.drainWorker();
    expect(await listRow(studentId)).toMatchObject({
      full_name: 'Ada Archive',
      status: 'archived',
      primary_instructor_name: null,
    });
  });
});
