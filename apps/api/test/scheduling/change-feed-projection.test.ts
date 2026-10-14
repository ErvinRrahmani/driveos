import { randomUUID } from 'node:crypto';
import {
  AvailabilityChanged,
  type EventDefinition,
  InstructorAssigned,
  InstructorUnassigned,
  LessonBooked,
  LessonCancelled,
  LessonMoved,
  ProgressRecorded,
  StudentAnonymized,
  StudentArchived,
  StudentCreated,
  TimeOffAdded,
  VehicleChanged,
} from '@driveos/shared';
import { eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import type { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DomainEvent, newEvent } from '../../src/kernel/cqrs/index.js';
import { newId } from '../../src/kernel/db/columns.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { lessons } from '../../src/modules/scheduling/infra/schema.js';
import { progressEntries, studentInstructors } from '../../src/modules/training/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { assignInstructor, createLogin, createSyllabus, type Login } from '../training/support.js';
import { insertLesson, insertLessonType, insertStudent } from './support.js';

const PROJECTION = 'scheduling.change-feed';
const HOUR_MS = 3_600_000;

interface FeedRow {
  seq: string;
  entity: string;
  entity_id: string;
  op: string;
  audience: string | null;
}

describe('change_feed projection (scheduling.change-feed)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let ingo: Login;
  let ina: Login;
  let lessonTypeId: string;
  let syllabus: string[];

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    tenants = await createTestTenants(db, { context: worker.tenant });
    ({ A } = tenants);
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    lessonTypeId = await insertLessonType(tenants, A);
    syllabus = await createSyllabus(tenants, A, ['B01', 'B02']);
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await tenants?.close();
    await system?.end();
    await db?.drop();
  });

  const lastSeq = async (): Promise<string> =>
    (
      await system.query<{ seq: string }>(
        `select coalesce(max(seq), 0)::text as seq from change_feed where school_id = $1`,
        [A.schoolId],
      )
    ).rows[0]?.seq ?? '0';

  const rowsAfter = async (seq: string) =>
    (
      await system.query<FeedRow>(
        `select seq::text, entity, entity_id, op::text, audience_membership_id as audience
           from change_feed where school_id = $1 and seq > $2 order by seq`,
        [A.schoolId, seq],
      )
    ).rows.map(({ entity, entity_id, op, audience }) => ({
      entity,
      id: entity_id,
      op,
      audience,
    }));

  function event<D extends EventDefinition>(
    definition: D,
    aggregateType: string,
    aggregateId: string,
    aggregateVersion: number,
    payload: z.input<D['schema']>,
  ): DomainEvent {
    return {
      id: randomUUID(),
      type: definition.type,
      version: definition.version,
      schoolId: A.schoolId,
      aggregateType,
      aggregateId,
      aggregateVersion,
      actorUserId: null,
      occurredAt: new Date(),
      payload,
    };
  }

  const handler = () => worker.app.get(SubscriberRegistry).get(PROJECTION).handler;

  const project = (...events: DomainEvent[]) =>
    worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, async () => {
      for (const e of events) await handler().handle(e, { subscriber: PROJECTION, attempt: 1 });
    });

  /** Appends the event rows and returns only the rows this call produced. */
  async function feed(...events: DomainEvent[]) {
    const mark = await lastSeq();
    await project(...events);
    return rowsAfter(mark);
  }

  let slot = 0;
  const lessonAt = (studentId: string, instructor: string, hoursFromNow = 48) => {
    slot += 1;
    const hours = hoursFromNow + Math.sign(hoursFromNow) * 2 * slot;
    return insertLesson(tenants, A, {
      studentId,
      instructorMembershipId: instructor,
      lessonTypeId,
      start: new Date(Date.now() + hours * HOUR_MS).toISOString(),
    });
  };

  const lessonPayload = (lessonId: string, studentId: string, instructor: string) => {
    const start = new Date(Date.now() + 48 * HOUR_MS);
    return {
      lessonId,
      studentId,
      instructorMembershipId: instructor,
      vehicleId: null,
      lessonTypeId,
      creditMinutes: 60,
      start: start.toISOString(),
      end: new Date(start.getTime() + HOUR_MS).toISOString(),
    };
  };

  async function progressOn(lessonId: string, studentId: string): Promise<string> {
    const id = newId();
    await tenants.asSchool(A, (tx) =>
      tx.insert(progressEntries).values({
        id,
        schoolId: A.schoolId,
        lessonId,
        studentId,
        syllabusItemId: syllabus[0] as string,
        level: 3,
        note: 'mirrors',
        version: 1,
      }),
    );
    return id;
  }

  const upsert = (entity: string, id: string, audience: string | null) => ({
    entity,
    id,
    op: 'upsert',
    audience,
  });
  const revoke = (entity: string, id: string, audience: string) => ({
    entity,
    id,
    op: 'revoke',
    audience,
  });

  it('is registered in the worker', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain(PROJECTION);
  });

  describe('lessons', () => {
    it("LessonBooked upserts the lesson for its instructor and the student's assigned instructors", async () => {
      const studentId = await insertStudent(tenants, A, 'Lea Lesson');
      await assignInstructor(tenants, A, studentId, ina.membershipId);
      const lessonId = await lessonAt(studentId, ingo.membershipId);

      const rows = await feed(
        event(LessonBooked, 'lesson', lessonId, 1, {
          ...lessonPayload(lessonId, studentId, ingo.membershipId),
          bookedVia: 'office',
          bookedByMembershipId: A.ownerMembershipId,
        }),
      );

      expect(rows).toEqual([
        upsert('lesson', lessonId, ingo.membershipId),
        upsert('lesson', lessonId, ina.membershipId),
      ]);
    });

    it('LessonCancelled upserts the lesson for its instructor (state is joined when pulled)', async () => {
      const studentId = await insertStudent(tenants, A, 'Cara Cancel');
      const lessonId = await lessonAt(studentId, ingo.membershipId);

      const rows = await feed(
        event(LessonCancelled, 'lesson', lessonId, 2, {
          ...lessonPayload(lessonId, studentId, ingo.membershipId),
          late: false,
          byRole: 'office',
          minutesRestored: 60,
          cancelledByMembershipId: A.ownerMembershipId,
        }),
      );

      expect(rows).toEqual([upsert('lesson', lessonId, ingo.membershipId)]);
    });

    it('a lesson moved to another instructor is revoked for the previous one and upserted for the new one', async () => {
      const studentId = await insertStudent(tenants, A, 'Mo Move');
      const lessonId = await lessonAt(studentId, ina.membershipId);
      const payload = lessonPayload(lessonId, studentId, ina.membershipId);

      const rows = await feed(
        event(LessonMoved, 'lesson', lessonId, 2, {
          ...payload,
          previousStart: payload.start,
          previousEnd: payload.end,
          previousInstructorMembershipId: ingo.membershipId,
          previousVehicleId: null,
          creditMinutesDelta: 0,
          movedByMembershipId: A.ownerMembershipId,
        }),
      );

      expect(rows).toEqual([
        revoke('lesson', lessonId, ingo.membershipId),
        upsert('lesson', lessonId, ina.membershipId),
      ]);
    });

    it('a moved lesson stays upserted for the previous instructor while they are assigned to the student', async () => {
      const studentId = await insertStudent(tenants, A, 'Kim Keep');
      await assignInstructor(tenants, A, studentId, ingo.membershipId);
      const lessonId = await lessonAt(studentId, ina.membershipId);
      const payload = lessonPayload(lessonId, studentId, ina.membershipId);

      const rows = await feed(
        event(LessonMoved, 'lesson', lessonId, 2, {
          ...payload,
          previousStart: payload.start,
          previousEnd: payload.end,
          previousInstructorMembershipId: ingo.membershipId,
          previousVehicleId: null,
          creditMinutesDelta: 0,
          movedByMembershipId: A.ownerMembershipId,
        }),
      );

      expect(rows).toEqual([
        upsert('lesson', lessonId, ina.membershipId),
        upsert('lesson', lessonId, ingo.membershipId),
      ]);
    });

    it('ignores a replayed or stale lesson event', async () => {
      const studentId = await insertStudent(tenants, A, 'Rita Replay');
      const lessonId = await lessonAt(studentId, ingo.membershipId);
      const booked = event(LessonBooked, 'lesson', lessonId, 1, {
        ...lessonPayload(lessonId, studentId, ingo.membershipId),
        bookedVia: 'office',
        bookedByMembershipId: A.ownerMembershipId,
      });

      expect(await feed(booked)).toHaveLength(1);
      expect(await feed(booked)).toEqual([]);
      expect(await feed({ ...booked, id: randomUUID() })).toEqual([]);
    });
  });

  describe('students and assignments', () => {
    it('StudentCreated upserts and StudentArchived/Anonymized delete the student for assigned instructors', async () => {
      const studentId = await insertStudent(tenants, A, 'Sam Student');
      await assignInstructor(tenants, A, studentId, ingo.membershipId);
      await assignInstructor(tenants, A, studentId, ina.membershipId, false);

      const created = await feed(
        event(StudentCreated, 'student', studentId, 1, {
          studentId,
          userId: null,
          fullName: 'Sam Student',
          licenceClass: 'B',
          examLanguage: 'en',
          testDate: null,
          area: null,
          status: 'active',
        }),
      );
      const archived = await feed(
        event(StudentArchived, 'student', studentId, 2, {
          studentId,
          archivedAt: new Date().toISOString(),
          completedLessons: 0,
        }),
      );
      const anonymized = await feed(
        event(StudentAnonymized, 'student', studentId, 3, {
          studentId,
          userId: null,
          userAnonymized: false,
          anonymizedAt: new Date().toISOString(),
        }),
      );

      const byAudience = <T extends { audience: string | null }>(rows: T[]) =>
        [...rows].sort((a, b) => (a.audience ?? '').localeCompare(b.audience ?? ''));
      expect(byAudience(created)).toEqual(
        byAudience([
          upsert('student', studentId, ingo.membershipId),
          upsert('student', studentId, ina.membershipId),
        ]),
      );
      const deleted = byAudience([
        { entity: 'student', id: studentId, op: 'delete', audience: ingo.membershipId },
        { entity: 'student', id: studentId, op: 'delete', audience: ina.membershipId },
      ]);
      expect(byAudience(archived)).toEqual(deleted);
      expect(byAudience(anonymized)).toEqual(deleted);
    });

    it("InstructorAssigned upserts the student, the student's booked lessons and progress entries", async () => {
      const studentId = await insertStudent(tenants, A, 'Ali Assign');
      const booked = await lessonAt(studentId, ina.membershipId);
      const cancelled = await lessonAt(studentId, ina.membershipId, 72);
      await tenants.asSchool(A, (tx) =>
        tx.update(lessons).set({ status: 'cancelled' }).where(eq(lessons.id, cancelled)),
      );
      const past = await lessonAt(studentId, ina.membershipId, -48);
      await tenants.asSchool(A, (tx) =>
        tx.update(lessons).set({ status: 'completed' }).where(eq(lessons.id, past)),
      );
      const entry = await progressOn(past, studentId);
      const assignmentId = await assignInstructor(tenants, A, studentId, ingo.membershipId);

      const rows = await feed(
        event(InstructorAssigned, 'student', studentId, 1, {
          assignmentId,
          studentId,
          instructorMembershipId: ingo.membershipId,
          instructorName: 'Ingo',
          isPrimary: true,
          assignedAt: new Date().toISOString(),
        }),
      );

      expect(rows).toEqual([
        upsert('student', studentId, ingo.membershipId),
        upsert('lesson', booked, ingo.membershipId),
        upsert('progress_entry', entry, ingo.membershipId),
      ]);
    });

    it('an unassigned student produces a revoke of the student, their lessons and progress entries for that instructor', async () => {
      const studentId = await insertStudent(tenants, A, 'Uma Unassign');
      const assignmentId = await assignInstructor(tenants, A, studentId, ingo.membershipId);
      await assignInstructor(tenants, A, studentId, ina.membershipId, false);
      const othersLesson = await lessonAt(studentId, ina.membershipId, -24);
      const othersEntry = await progressOn(othersLesson, studentId);
      const ownLesson = await lessonAt(studentId, ingo.membershipId);
      await tenants.asSchool(A, (tx) =>
        tx
          .update(studentInstructors)
          .set({ unassignedAt: new Date() })
          .where(eq(studentInstructors.id, assignmentId)),
      );

      const rows = await feed(
        event(InstructorUnassigned, 'student', studentId, 2, {
          assignmentId,
          studentId,
          instructorMembershipId: ingo.membershipId,
          wasPrimary: true,
          unassignedAt: new Date().toISOString(),
        }),
      );

      expect(rows).toEqual([
        revoke('student', studentId, ingo.membershipId),
        revoke('lesson', othersLesson, ingo.membershipId),
        revoke('progress_entry', othersEntry, ingo.membershipId),
      ]);
      expect(rows.map((row) => row.id)).not.toContain(ownLesson);
    });
  });

  it("ProgressRecorded upserts each entry for the lesson's instructor and assigned instructors", async () => {
    const studentId = await insertStudent(tenants, A, 'Pia Progress');
    await assignInstructor(tenants, A, studentId, ina.membershipId);
    const lessonId = await lessonAt(studentId, ingo.membershipId, -24);
    const first = await progressOn(lessonId, studentId);
    const second = newId();

    const rows = await feed(
      event(ProgressRecorded, 'student', studentId, 1, {
        lessonId,
        studentId,
        instructorMembershipId: ingo.membershipId,
        entries: [
          { progressEntryId: first, syllabusItemId: syllabus[0] as string, level: 3, version: 1 },
          { progressEntryId: second, syllabusItemId: syllabus[1] as string, level: 2, version: 1 },
        ],
      }),
    );

    expect(rows).toEqual([
      upsert('progress_entry', first, ingo.membershipId),
      upsert('progress_entry', first, ina.membershipId),
      upsert('progress_entry', second, ingo.membershipId),
      upsert('progress_entry', second, ina.membershipId),
    ]);
  });

  it('VehicleChanged is school-wide: upsert while active, delete when inactive', async () => {
    const vehicleId = randomUUID();
    const vehicle = (active: boolean) => ({
      vehicleId,
      change: 'updated' as const,
      branchId: randomUUID(),
      plate: 'B-DO 1',
      makeModel: 'VW Golf',
      transmission: 'manual' as const,
      licenceClass: 'B',
      active,
    });

    const active = await feed(event(VehicleChanged, 'vehicle', vehicleId, 1, vehicle(true)));
    const inactive = await feed(event(VehicleChanged, 'vehicle', vehicleId, 2, vehicle(false)));

    expect(active).toEqual([upsert('vehicle', vehicleId, null)]);
    expect(inactive).toEqual([{ entity: 'vehicle', id: vehicleId, op: 'delete', audience: null }]);
  });

  it("AvailabilityChanged and TimeOffAdded upsert the instructor's availability for that instructor", async () => {
    const changed = await feed(
      event(AvailabilityChanged, 'availability', ina.membershipId, 1, {
        instructorMembershipId: ina.membershipId,
        effectiveFrom: '2026-09-01',
        windows: [{ weekday: 1, startTime: '09:00', endTime: '17:00' }],
      }),
    );
    const timeOffId = randomUUID();
    const timeOff = await feed(
      event(TimeOffAdded, 'time_off', timeOffId, 1, {
        timeOffId,
        instructorMembershipId: ina.membershipId,
        start: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
        end: new Date(Date.now() + 26 * HOUR_MS).toISOString(),
      }),
    );

    expect(changed).toEqual([upsert('availability', ina.membershipId, ina.membershipId)]);
    expect(timeOff).toEqual([upsert('availability', ina.membershipId, ina.membershipId)]);
  });

  it('feeds rows through the real outbox delivery path', async () => {
    const vehicleId = randomUUID();
    const mark = await lastSeq();
    await worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
      worker.publisher.append([
        newEvent(VehicleChanged, {
          aggregateType: 'vehicle',
          aggregateId: vehicleId,
          aggregateVersion: 1,
          payload: {
            vehicleId,
            change: 'created',
            branchId: randomUUID(),
            plate: 'B-DO 2',
            makeModel: 'Seat Ibiza',
            transmission: 'manual',
            licenceClass: 'B',
            active: true,
          },
        }),
      ]),
    );

    const drained = await worker.drainWorker();

    expect(drained.failed).toBe(0);
    expect((await rowsAfter(mark)).filter((row) => row.id === vehicleId)).toEqual([
      upsert('vehicle', vehicleId, null),
    ]);
  });

  describe('single writer per school', () => {
    const vehicleEvent = () => {
      const vehicleId = randomUUID();
      return event(VehicleChanged, 'vehicle', vehicleId, 1, {
        vehicleId,
        change: 'created',
        branchId: randomUUID(),
        plate: 'B-DO 3',
        makeModel: 'VW Polo',
        transmission: 'manual',
        licenceClass: 'B',
        active: true,
      });
    };

    const waitingAdvisoryLocks = async () =>
      Number(
        (
          await system.query<{ n: string }>(
            `select count(*) as n from pg_locks
              where locktype = 'advisory' and not granted
                and database = (select oid from pg_database where datname = current_database())`,
          )
        ).rows[0]?.n ?? 0,
      );

    async function untilWaiting(): Promise<void> {
      const deadline = Date.now() + 3_000;
      while ((await waitingAdvisoryLocks()) === 0) {
        if (Date.now() > deadline) throw new Error('the second writer never waited on the lock');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    const pullSeqs = async (cursor: string) =>
      tenants.asSchool(A, async (tx) => {
        const result = await tx.execute<{ seq: string }>(
          sql`select seq::text as seq from change_feed where seq > ${cursor}::bigint order by seq`,
        );
        return result.rows.map((row) => row.seq);
      });

    it('a second writer cannot append while the first transaction is open (short lock timeout)', async () => {
      const first = heldWriter(vehicleEvent());
      await first.written;

      const failure = await worker.tenant
        .runInTenant({ schoolId: A.schoolId, userId: null }, async () => {
          await worker.tenant.tx.execute(sql`select set_config('lock_timeout', '200ms', true)`);
          await handler().handle(vehicleEvent(), { subscriber: PROJECTION, attempt: 1 });
        })
        .then(
          () => null,
          (error: unknown) => error as { code?: string; cause?: { code?: string } },
        );
      first.commit();
      await first.done;

      expect(failure?.cause?.code ?? failure?.code).toBe('55P03');
    });

    function heldWriter(e: DomainEvent) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let markWritten!: () => void;
      const written = new Promise<void>((resolve) => (markWritten = resolve));
      const done = worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, async () => {
        await handler().handle(e, { subscriber: PROJECTION, attempt: 1 });
        markWritten();
        await gate;
      });
      return { written, done, commit: release };
    }

    it('two transactions committing out of order never make a cursor skip a change', async () => {
      const start = await lastSeq();
      const firstEvent = vehicleEvent();
      const secondEvent = vehicleEvent();

      const first = heldWriter(firstEvent);
      await first.written;
      const second = heldWriter(secondEvent);
      try {
        await untilWaiting();

        expect(await pullSeqs(start)).toEqual([]);

        first.commit();
        await first.done;
        await second.written;
        const afterFirst = await pullSeqs(start);
        expect(afterFirst).toHaveLength(1);
        const cursor = afterFirst[0] as string;

        second.commit();
        await second.done;
        const afterSecond = await pullSeqs(cursor);
        expect(afterSecond).toHaveLength(1);
        expect(BigInt(afterSecond[0] as string)).toBeGreaterThan(BigInt(cursor));
      } finally {
        first.commit();
        second.commit();
        await Promise.allSettled([first.done, second.done]);
      }
      expect((await rowsAfter(start)).map((row) => row.id)).toEqual([
        firstEvent.aggregateId,
        secondEvent.aggregateId,
      ]);
    });
  });
});
