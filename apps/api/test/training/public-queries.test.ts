import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import {
  GetStudentBookingProfileQuery,
  GetStudentByUserQuery,
  GetStudentMinorStatusQuery,
  GetStudentRecipientsQuery,
  HasPassedPracticalQuery,
  ListLinkedStudentIdsQuery,
  ListProgressEntriesQuery,
  ListStudentIdsForInstructorQuery,
} from '../../src/modules/training/index.js';
import { newId } from '../../src/kernel/db/columns.js';
import { testAttempts } from '../../src/modules/training/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent, createUser } from '../identity/support.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import {
  assignInstructor,
  createLessonRow,
  createLogin,
  createSyllabus,
  dateYearsAgo,
  linkGuardianRow,
} from './support.js';

describe('training public queries (bus contracts for identity, billing, scheduling, messaging)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const ask = <T>(query: Parameters<typeof executeAs<T>>[2], tenant = A) =>
    executeAs<T>(kernel.app, tenant, query);

  it('GetStudentMinorStatusQuery: minor from date of birth and the school age of majority', async () => {
    const minor = await createStudent(tenants, A, { dateOfBirth: dateYearsAgo(18, 1) });
    const adult = await createStudent(tenants, A, { dateOfBirth: dateYearsAgo(18) });
    expect(await ask(new GetStudentMinorStatusQuery(minor))).toEqual({
      studentId: minor,
      dateOfBirth: dateYearsAgo(18, 1),
      ageOfMajority: 18,
      isMinor: true,
      hasGuardianConsent: false,
    });
    expect(await ask(new GetStudentMinorStatusQuery(adult))).toMatchObject({ isMinor: false });
    const guardian = await createUser(tenants, { memberships: [{ tenant: A, roles: ['parent'] }] });
    await linkGuardianRow(tenants, A, minor, guardian.userId, new Date());
    expect(await ask(new GetStudentMinorStatusQuery(minor))).toMatchObject({
      hasGuardianConsent: true,
    });
    expect(await ask(new GetStudentMinorStatusQuery(minor), B)).toBeNull();
  });

  it('GetStudentBookingProfileQuery and GetStudentByUserQuery: the booking facts of a student', async () => {
    const user = await createUser(tenants, { memberships: [{ tenant: A, roles: ['student'] }] });
    const studentId = await createStudent(tenants, A, {
      dateOfBirth: '2000-01-01',
      userId: user.userId,
    });
    const primary = await createLogin(tenants, A, ['instructor']);
    const second = await createLogin(tenants, A, ['instructor']);
    await assignInstructor(tenants, A, studentId, primary.membershipId, true);
    await assignInstructor(tenants, A, studentId, second.membershipId, false);
    const profile = await ask(new GetStudentBookingProfileQuery(studentId));
    expect(profile).toMatchObject({
      studentId,
      userId: user.userId,
      status: 'active',
      licenceClass: 'B',
      primaryInstructorMembershipId: primary.membershipId,
    });
    expect(profile?.allowedInstructorMembershipIds.sort()).toEqual(
      [primary.membershipId, second.membershipId].sort(),
    );
    expect(await ask(new GetStudentByUserQuery(user.userId))).toEqual(profile);
    expect(await ask(new GetStudentBookingProfileQuery(studentId), B)).toBeNull();
    await system.query(`update students set status = 'anonymized' where id = $1`, [studentId]);
    expect(await ask(new GetStudentByUserQuery(user.userId))).toBeNull();
  });

  it('ListLinkedStudentIdsQuery and GetStudentRecipientsQuery: consented, not revoked links only', async () => {
    const guardian = await createUser(tenants, { memberships: [{ tenant: A, roles: ['parent'] }] });
    const studentUser = await createUser(tenants, {
      memberships: [{ tenant: A, roles: ['student'] }],
    });
    const consented = await createStudent(tenants, A, {
      dateOfBirth: '2010-01-01',
      userId: studentUser.userId,
    });
    const pending = await createStudent(tenants, A, { dateOfBirth: '2010-01-01' });
    const revoked = await createStudent(tenants, A, { dateOfBirth: '2010-01-01' });
    await linkGuardianRow(tenants, A, consented, guardian.userId, new Date());
    await linkGuardianRow(tenants, A, pending, guardian.userId, null);
    const revokedLink = await linkGuardianRow(tenants, A, revoked, guardian.userId, new Date());
    await system.query(`update guardian_links set revoked_at = now() where id = $1`, [revokedLink]);
    expect(await ask(new ListLinkedStudentIdsQuery(guardian.userId))).toEqual([consented]);
    expect(await ask(new ListLinkedStudentIdsQuery(guardian.userId), B)).toEqual([]);
    expect(await ask(new GetStudentRecipientsQuery(consented))).toEqual({
      studentId: consented,
      studentUserId: studentUser.userId,
      guardianUserIds: [guardian.userId],
    });
    expect(await ask(new GetStudentRecipientsQuery(pending))).toEqual({
      studentId: pending,
      studentUserId: null,
      guardianUserIds: [],
    });
    expect(await ask(new GetStudentRecipientsQuery(consented), B)).toBeNull();
  });

  it('ListStudentIdsForInstructorQuery: active assignments only', async () => {
    const instructor = await createLogin(tenants, A, ['instructor']);
    const active = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    const ended = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    await assignInstructor(tenants, A, active, instructor.membershipId);
    const endedAssignment = await assignInstructor(tenants, A, ended, instructor.membershipId);
    await system.query(`update student_instructors set unassigned_at = now() where id = $1`, [
      endedAssignment,
    ]);
    expect(await ask(new ListStudentIdsForInstructorQuery(instructor.membershipId))).toEqual([
      active,
    ]);
    expect(await ask(new ListStudentIdsForInstructorQuery(instructor.membershipId), B)).toEqual([]);
  });

  it('ListProgressEntriesQuery: progress entries by id or by student, never private notes', async () => {
    const instructor = await createLogin(tenants, A, ['instructor']);
    const [item] = await createSyllabus(tenants, A, ['P01']);
    const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    const other = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    const lessonId = await createLessonRow(tenants, A, {
      studentId,
      instructorMembershipId: instructor.membershipId,
      start: new Date(Date.now() - 86_400_000),
      status: 'completed',
    });
    const otherLesson = await createLessonRow(tenants, A, {
      studentId: other,
      instructorMembershipId: instructor.membershipId,
      start: new Date(Date.now() - 2 * 86_400_000),
      status: 'completed',
    });
    const entry = (id: string, lesson: string, student: string) =>
      system.query(
        `insert into progress_entries (id, school_id, lesson_id, student_id, syllabus_item_id, level, note, version)
         values ($1, $2, $3, $4, $5, 4, 'smooth', 2)`,
        [id, A.schoolId, lesson, student, item],
      );
    const mine = '01900000-0000-7000-8000-00000000a001';
    const theirs = '01900000-0000-7000-8000-00000000a002';
    await entry(mine, lessonId, studentId);
    await entry(theirs, otherLesson, other);

    const expected = {
      id: mine,
      lessonId,
      studentId,
      syllabusItemId: item,
      level: 4,
      note: 'smooth',
      version: 2,
    };
    expect(await ask(new ListProgressEntriesQuery({ studentIds: [studentId] }))).toEqual([
      expected,
    ]);
    expect(await ask(new ListProgressEntriesQuery({ ids: [mine, theirs] }))).toHaveLength(2);
    expect(await ask(new ListProgressEntriesQuery({ ids: [] }))).toEqual([]);
    expect(await ask(new ListProgressEntriesQuery({ ids: [mine] }), B)).toEqual([]);
  });

  it('HasPassedPracticalQuery: true only for a passed practical test attempt', async () => {
    const attempt = (
      studentId: string,
      kind: 'theory' | 'practical',
      result: 'passed' | 'failed',
    ) =>
      tenants.asSchool(A, (tx) =>
        tx.insert(testAttempts).values({
          id: newId(),
          schoolId: A.schoolId,
          studentId,
          kind,
          takenOn: '2026-09-01',
          result,
          notes: '',
        }),
      );
    const passedPractical = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    const theoryOnly = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    const failedPractical = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    const noAttempts = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    await attempt(passedPractical, 'practical', 'failed');
    await attempt(passedPractical, 'practical', 'passed');
    await attempt(theoryOnly, 'theory', 'passed');
    await attempt(failedPractical, 'practical', 'failed');

    expect(await ask(new HasPassedPracticalQuery(passedPractical))).toBe(true);
    expect(await ask(new HasPassedPracticalQuery(theoryOnly))).toBe(false);
    expect(await ask(new HasPassedPracticalQuery(failedPractical))).toBe(false);
    expect(await ask(new HasPassedPracticalQuery(noAttempts))).toBe(false);
    expect(await ask(new HasPassedPracticalQuery(newId()))).toBe(false);
    expect(await ask(new HasPassedPracticalQuery(passedPractical), B)).toBe(false);
  });
});
