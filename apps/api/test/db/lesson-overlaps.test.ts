import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSchoolFixture, insertLesson, type SchoolFixture } from './fixtures.js';
import { lessons } from '../../src/modules/scheduling/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from './scratch-database.js';

const TEN_TO_ELEVEN = '[2026-03-02 10:00:00+00,2026-03-02 11:00:00+00)';
const HALF_PAST_TEN = '[2026-03-02 10:30:00+00,2026-03-02 11:30:00+00)';
const ELEVEN_TO_NOON = '[2026-03-02 11:00:00+00,2026-03-02 12:00:00+00)';

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; constraint?: string };
  }
  throw new Error('expected the database to reject the lesson');
}

describe('lesson overlaps are rejected by the database', () => {
  let db: ScratchDatabase;
  let client: pg.Client;
  let f: SchoolFixture;

  beforeAll(async () => {
    db = await createScratchDatabase();
    client = await connect(db.systemUrl);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    f = await createSchoolFixture(client);
  });

  it('rejects an overlapping lesson for the same instructor', async () => {
    const [instructor, other] = f.instructorIds;
    await insertLesson(client, f, {
      instructor,
      student: f.studentIds[0],
      vehicle: f.vehicleIds[0],
      period: TEN_TO_ELEVEN,
    });
    const error = await rejection(
      insertLesson(client, f, {
        instructor,
        student: f.studentIds[1],
        vehicle: f.vehicleIds[1],
        period: HALF_PAST_TEN,
      }),
    );
    expect(error).toMatchObject({ code: '23P01', constraint: 'lessons_instructor_no_overlap' });
    await insertLesson(client, f, {
      instructor: other,
      student: f.studentIds[1],
      vehicle: f.vehicleIds[1],
      period: HALF_PAST_TEN,
    });
  });

  it('rejects an overlapping lesson for the same vehicle', async () => {
    await insertLesson(client, f, {
      instructor: f.instructorIds[0],
      student: f.studentIds[0],
      vehicle: f.vehicleIds[0],
      period: TEN_TO_ELEVEN,
    });
    const error = await rejection(
      insertLesson(client, f, {
        instructor: f.instructorIds[1],
        student: f.studentIds[1],
        vehicle: f.vehicleIds[0],
        period: HALF_PAST_TEN,
      }),
    );
    expect(error).toMatchObject({ code: '23P01', constraint: 'lessons_vehicle_no_overlap' });
  });

  it('lets lessons without a vehicle overlap on the vehicle constraint', async () => {
    await insertLesson(client, f, {
      instructor: f.instructorIds[0],
      student: f.studentIds[0],
      vehicle: null,
      period: TEN_TO_ELEVEN,
    });
    await insertLesson(client, f, {
      instructor: f.instructorIds[1],
      student: f.studentIds[1],
      vehicle: null,
      period: HALF_PAST_TEN,
    });
  });

  it('rejects an overlapping lesson for the same student', async () => {
    await insertLesson(client, f, {
      instructor: f.instructorIds[0],
      student: f.studentIds[0],
      vehicle: f.vehicleIds[0],
      period: TEN_TO_ELEVEN,
    });
    const error = await rejection(
      insertLesson(client, f, {
        instructor: f.instructorIds[1],
        student: f.studentIds[0],
        vehicle: f.vehicleIds[1],
        period: HALF_PAST_TEN,
      }),
    );
    expect(error).toMatchObject({ code: '23P01', constraint: 'lessons_student_no_overlap' });
  });

  it('treats completed lessons as blocking', async () => {
    await insertLesson(client, f, {
      instructor: f.instructorIds[0],
      student: f.studentIds[0],
      vehicle: f.vehicleIds[0],
      period: TEN_TO_ELEVEN,
      status: 'completed',
    });
    const error = await rejection(
      insertLesson(client, f, {
        instructor: f.instructorIds[0],
        student: f.studentIds[1],
        vehicle: f.vehicleIds[1],
        period: HALF_PAST_TEN,
      }),
    );
    expect(error.code).toBe('23P01');
  });

  it('does not let cancelled or no-show lessons block the slot', async () => {
    const same = {
      instructor: f.instructorIds[0],
      student: f.studentIds[0],
      vehicle: f.vehicleIds[0],
      period: TEN_TO_ELEVEN,
    };
    await insertLesson(client, f, { ...same, status: 'cancelled' });
    await insertLesson(client, f, { ...same, status: 'no_show' });
    await insertLesson(client, f, same);
  });

  it('rejects re-activating a cancelled lesson into an occupied slot', async () => {
    const same = {
      instructor: f.instructorIds[0],
      student: f.studentIds[0],
      vehicle: f.vehicleIds[0],
      period: TEN_TO_ELEVEN,
    };
    const cancelled = await insertLesson(client, f, { ...same, status: 'cancelled' });
    await insertLesson(client, f, same);
    const error = await rejection(
      client.query(`update lessons set status = 'booked' where id = $1`, [cancelled]),
    );
    expect(error.code).toBe('23P01');
  });

  it('accepts adjacent half-open periods for the same instructor, vehicle and student', async () => {
    const same = {
      instructor: f.instructorIds[0],
      student: f.studentIds[0],
      vehicle: f.vehicleIds[0],
    };
    await insertLesson(client, f, { ...same, period: TEN_TO_ELEVEN });
    await insertLesson(client, f, { ...same, period: ELEVEN_TO_NOON });
  });

  it('round-trips a period through the drizzle tstzrange column', async () => {
    const id = await insertLesson(client, f, {
      instructor: f.instructorIds[0],
      student: f.studentIds[0],
      vehicle: null,
      period: TEN_TO_ELEVEN,
    });
    const db = drizzle(client);
    const [row] = await db
      .select({ period: lessons.period })
      .from(lessons)
      .where(eq(lessons.id, id));
    expect(row?.period).toEqual({
      start: new Date('2026-03-02T10:00:00Z'),
      end: new Date('2026-03-02T11:00:00Z'),
    });
    const moved = {
      start: new Date('2026-03-02T14:15:00Z'),
      end: new Date('2026-03-02T15:00:00Z'),
    };
    await db.update(lessons).set({ period: moved }).where(eq(lessons.id, id));
    const [after] = await db
      .select({ period: lessons.period })
      .from(lessons)
      .where(eq(lessons.id, id));
    expect(after?.period).toEqual(moved);
  });
});
