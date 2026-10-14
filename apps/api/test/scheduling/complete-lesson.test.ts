import { LessonCompleted } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { lessons } from '../../src/modules/scheduling/infra/schema.js';
import { privateNotes, progressEntries } from '../../src/modules/training/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createLogin, createSyllabus, type Login } from '../training/support.js';
import { insertLesson, insertLessonType, insertStudent } from './support.js';
import { StatusCodes } from 'http-status-codes';

const HOUR = 3_600_000;

describe('POST /v1/lessons/:id/complete', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let office: Login;
  let ingo: Login;
  let ina: Login;
  let stellaLogin: Login;
  let stella: string;
  let standard: string;
  let syllabus: string[];
  let slot = 0;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A } = tenants);
    http = request(kernel.app.getHttpServer());
    office = await createLogin(tenants, A, ['office']);
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    stellaLogin = await createLogin(tenants, A, ['student']);
    stella = await insertStudent(tenants, A, 'Stella Student', stellaLogin.userId);
    standard = await insertLessonType(tenants, A);
    syllabus = await createSyllabus(tenants, A, ['B01', 'B02']);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  function pastLesson(): Promise<string> {
    slot += 1;
    return insertLesson(tenants, A, {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: new Date(Date.now() - slot * 2 * HOUR).toISOString(),
    });
  }

  function complete(
    headers: Record<string, string>,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    return http.post(`/v1/lessons/${id}/complete`).set(headers).send(body);
  }

  async function statusOf(id: string): Promise<string | undefined> {
    const [row] = await tenants.asSchool(A, (tx) =>
      tx.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, id)),
    );
    return row?.status;
  }

  it('lets the instructor complete with progress and a private note, without touching credits', async () => {
    const id = await pastLesson();
    const res = await complete(ingo.headers, id, {
      progress: [{ syllabusItemId: syllabus[0], level: 3, note: 'Good mirrors' }],
      privateNote: 'Nervous at roundabouts',
      version: 1,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
    expect(res.body).toEqual({ id, version: 2 });
    expect(await statusOf(id)).toBe('completed');

    const [progress, notes, ledger] = await tenants.asSchool(A, async (tx) => [
      await tx.select().from(progressEntries).where(eq(progressEntries.lessonId, id)),
      await tx.select().from(privateNotes).where(eq(privateNotes.lessonId, id)),
      await tx.select().from(ledgerEntries).where(eq(ledgerEntries.studentId, stella)),
    ]);
    expect(progress).toMatchObject([{ syllabusItemId: syllabus[0], level: 3, studentId: stella }]);
    expect(notes).toMatchObject([
      { body: 'Nervous at roundabouts', authorMembershipId: ingo.membershipId },
    ]);
    expect(ledger).toHaveLength(0);

    const event = await expectEventAppended(db, { type: LessonCompleted, aggregateId: id });
    expect(event.aggregateVersion).toBe(2);
    expect(event.payload).toMatchObject({
      lessonId: id,
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      creditMinutes: 60,
    });
  });

  it('lets office staff complete a lesson without a body', async () => {
    const id = await pastLesson();
    const res = await complete(office.headers, id);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
    expect(await statusOf(id)).toBe('completed');
  });

  it('forbids the student and hides the lesson from another instructor', async () => {
    const id = await pastLesson();
    expect((await complete(stellaLogin.headers, id)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await complete(ina.headers, id)).status).toBe(StatusCodes.NOT_FOUND);
    expect(await statusOf(id)).toBe('booked');
  });

  it('answers 409 lesson_not_booked for an already completed lesson', async () => {
    const id = await pastLesson();
    await complete(ingo.headers, id).expect(StatusCodes.OK);
    const res = await complete(ingo.headers, id);
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('lesson_not_booked');
  });

  it('answers 409 version_conflict with the server version', async () => {
    const id = await pastLesson();
    const res = await complete(ingo.headers, id, { version: 7 });
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('version_conflict');
    expect(res.body.error.details.serverVersion).toMatchObject({ id, version: 1 });
  });

  it('answers 409 lesson_not_started before the lesson begins', async () => {
    const id = await insertLesson(tenants, A, {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: new Date(Date.now() + 48 * HOUR).toISOString(),
    });
    const res = await complete(ingo.headers, id);
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('lesson_not_started');
  });

  it('rolls the completion back when the progress is invalid', async () => {
    const id = await pastLesson();
    const res = await complete(ingo.headers, id, {
      progress: [{ syllabusItemId: crypto.randomUUID(), level: 2 }],
    });
    expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await statusOf(id)).toBe('booked');
  });
});
