import { LessonMarkedNoShow } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { lessons } from '../../src/modules/scheduling/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createLogin, type Login } from '../training/support.js';
import { insertLesson, insertLessonType, insertStudent } from './support.js';
import { StatusCodes } from 'http-status-codes';

const HOUR = 3_600_000;

describe('POST /v1/lessons/:id/no-show', () => {
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
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  function lessonAt(offsetMs: number): Promise<string> {
    return insertLesson(tenants, A, {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: new Date(Date.now() + offsetMs).toISOString(),
    });
  }

  function pastLesson(): Promise<string> {
    slot += 1;
    return lessonAt(-slot * 2 * HOUR - 5 * 60_000);
  }

  function noShow(headers: Record<string, string>, id: string, body: Record<string, unknown> = {}) {
    return http.post(`/v1/lessons/${id}/no-show`).set(headers).send(body);
  }

  async function statusOf(id: string): Promise<string | undefined> {
    const [row] = await tenants.asSchool(A, (tx) =>
      tx.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, id)),
    );
    return row?.status;
  }

  it('answers 409 lesson_not_started before the lesson begins', async () => {
    const id = await lessonAt(48 * HOUR);
    const res = await noShow(ingo.headers, id);
    expect(res.status).toBe(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('lesson_not_started');
    expect(await statusOf(id)).toBe('booked');
  });

  it('lets the instructor mark a started lesson as a no-show and keeps the minutes debited', async () => {
    const id = await pastLesson();
    const res = await noShow(ingo.headers, id, { version: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
    expect(res.body).toEqual({ id, version: 2 });
    expect(await statusOf(id)).toBe('no_show');
    const ledger = await tenants.asSchool(A, (tx) =>
      tx.select().from(ledgerEntries).where(eq(ledgerEntries.studentId, stella)),
    );
    expect(ledger).toHaveLength(0);
    const event = await expectEventAppended(db, { type: LessonMarkedNoShow, aggregateId: id });
    expect(event.aggregateVersion).toBe(2);
    expect(event.payload).toMatchObject({
      lessonId: id,
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      markedByMembershipId: ingo.membershipId,
    });
  });

  it('lets office staff mark a no-show', async () => {
    const id = await pastLesson();
    expect((await noShow(office.headers, id)).status).toBe(StatusCodes.OK);
    expect(await statusOf(id)).toBe('no_show');
  });

  it('forbids the student and hides the lesson from another instructor', async () => {
    const id = await pastLesson();
    expect((await noShow(stellaLogin.headers, id)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await noShow(ina.headers, id)).status).toBe(StatusCodes.NOT_FOUND);
    expect(await statusOf(id)).toBe('booked');
  });

  it('answers 409 for a lesson that is no longer booked and for a stale version', async () => {
    const done = await pastLesson();
    await noShow(ingo.headers, done).expect(StatusCodes.OK);
    const again = await noShow(ingo.headers, done);
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(again.body.error.code).toBe('lesson_not_booked');

    const stale = await noShow(ingo.headers, await pastLesson(), { version: 3 });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(stale.body.error.code).toBe('version_conflict');
    expect(stale.body.error.details.serverVersion).toMatchObject({ version: 1 });
  });
});
