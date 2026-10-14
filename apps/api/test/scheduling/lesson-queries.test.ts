import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import {
  CountCompletedLessonsQuery,
  GetLessonQuery,
  HasCompletedLessonsQuery,
  ListStudentIdsWithLessonsQuery,
} from '../../src/modules/scheduling/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createLogin, type Login } from '../training/support.js';
import { insertLesson, insertLessonType, insertStudent, type LessonFixture } from './support.js';

const DAY = 86_400_000;

describe('scheduling public queries', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let ingo: Login;
  let ina: Login;
  let standard: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    standard = await insertLessonType(tenants, A, { name: 'Standard lesson' });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  function lesson(
    studentId: string,
    instructor: Login,
    offsetMs: number,
    status: LessonFixture['status'] = 'booked',
  ): Promise<string> {
    return insertLesson(tenants, A, {
      studentId,
      instructorMembershipId: instructor.membershipId,
      lessonTypeId: standard,
      start: new Date(Date.now() + offsetMs).toISOString(),
      status,
    });
  }

  it('GetLessonQuery returns the lesson view, and null for unknown or other-school lessons', async () => {
    const stella = await insertStudent(tenants, A, 'Stella Student');
    const id = await lesson(stella, ingo, 5 * DAY);
    const found = await executeAs(kernel.app, A, new GetLessonQuery(id));
    expect(found).toMatchObject({
      id,
      studentId: stella,
      studentName: 'Stella Student',
      instructorMembershipId: ingo.membershipId,
      lessonTypeName: 'Standard lesson',
      status: 'booked',
      version: 1,
    });
    expect(await executeAs(kernel.app, A, new GetLessonQuery(crypto.randomUUID()))).toBeNull();
    expect(await executeAs(kernel.app, B, new GetLessonQuery(id))).toBeNull();
  });

  it('ListStudentIdsWithLessonsQuery lists distinct students with a recent or future, not cancelled lesson', async () => {
    const recent = await insertStudent(tenants, A, 'Recent');
    const future = await insertStudent(tenants, A, 'Future');
    const old = await insertStudent(tenants, A, 'Old');
    const cancelled = await insertStudent(tenants, A, 'Cancelled');
    const otherInstructor = await insertStudent(tenants, A, 'Other instructor');
    await lesson(recent, ingo, -10 * DAY, 'completed');
    await lesson(recent, ingo, -9 * DAY, 'no_show');
    await lesson(future, ingo, 3 * DAY);
    await lesson(old, ingo, -100 * DAY, 'completed');
    await lesson(cancelled, ingo, 4 * DAY, 'cancelled');
    await lesson(otherInstructor, ina, 6 * DAY);
    const ids = await executeAs(
      kernel.app,
      A,
      new ListStudentIdsWithLessonsQuery(ingo.membershipId, new Date(Date.now() - 90 * DAY)),
    );
    expect(ids).toEqual(expect.arrayContaining([recent, future]));
    expect(ids).toHaveLength(new Set(ids).size);
    for (const hidden of [old, cancelled, otherInstructor]) expect(ids).not.toContain(hidden);
    expect(
      await executeAs(
        kernel.app,
        B,
        new ListStudentIdsWithLessonsQuery(ingo.membershipId, new Date(Date.now() - 90 * DAY)),
      ),
    ).toEqual([]);
  });

  it('CountCompletedLessonsQuery and HasCompletedLessonsQuery count only completed lessons', async () => {
    const sam = await insertStudent(tenants, A, 'Sam');
    const sora = await insertStudent(tenants, A, 'Sora');
    await lesson(sam, ina, -20 * DAY, 'completed');
    await lesson(sam, ina, -19 * DAY, 'completed');
    await lesson(sam, ina, -18 * DAY, 'no_show');
    await lesson(sam, ina, 2 * DAY);
    await lesson(sora, ina, -17 * DAY, 'cancelled');
    expect(await executeAs(kernel.app, A, new CountCompletedLessonsQuery(sam))).toBe(2);
    expect(await executeAs(kernel.app, A, new HasCompletedLessonsQuery(sam))).toBe(true);
    expect(await executeAs(kernel.app, A, new CountCompletedLessonsQuery(sora))).toBe(0);
    expect(await executeAs(kernel.app, A, new HasCompletedLessonsQuery(sora))).toBe(false);
    expect(await executeAs(kernel.app, B, new CountCompletedLessonsQuery(sam))).toBe(0);
  });
});
