import { syncPullResponseSchema, type SyncChange } from '@driveos/shared';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { auditLog } from '../../src/modules/platform/infra/schema.js';
import { changeFeed, lessons } from '../../src/modules/scheduling/infra/schema.js';
import { progressEntries, students } from '../../src/modules/training/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createUser, uniquePhone } from '../identity/support.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { assignInstructor, createLogin, createSyllabus, type Login } from '../training/support.js';
import {
  insertLesson,
  insertLessonType,
  insertStudent,
  insertVehicle,
  insertWeekdayAvailability,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const HOUR_MS = 3_600_000;

type Entity = 'lesson' | 'student' | 'vehicle' | 'progress_entry' | 'availability';
type Op = 'upsert' | 'delete' | 'revoke';

describe('GET /v1/sync (change_feed pull)', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let lessonTypeId: string;
  let syllabusItem: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    lessonTypeId = await insertLessonType(tenants, A);
    [syllabusItem] = (await createSyllabus(tenants, A, ['S01'])) as [string];
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const instructor = () => createLogin(tenants, A, ['instructor']);

  const head = async (tenant: TestTenant = A): Promise<string> =>
    tenants.asSchool(tenant, async (tx) => {
      const result = await tx.execute<{ seq: string }>(
        sql`select coalesce(max(seq), 0)::text as seq from change_feed`,
      );
      return result.rows[0]?.seq ?? '0';
    });

  async function addRow(
    entity: Entity,
    entityId: string,
    op: Op,
    audience: string | null,
    tenant: TestTenant = A,
  ): Promise<void> {
    await tenants.asSchool(tenant, (tx) =>
      tx.insert(changeFeed).values({
        schoolId: tenant.schoolId,
        entity,
        entityId,
        op,
        audienceMembershipId: audience,
        at: new Date(),
      }),
    );
  }

  const pull = (login: Login, query: Record<string, string>) =>
    http.get('/v1/sync').set(login.headers).query(query);

  async function pullAll(login: Login, cursor: string) {
    const res = await pull(login, { cursor }).expect(StatusCodes.OK);
    return syncPullResponseSchema.parse(res.body);
  }

  const summary = (items: SyncChange[]) =>
    items.map((item) => ({ entity: item.entity, id: item.entityId, op: item.op }));

  let slot = 0;
  const lessonOf = (studentId: string, instructorId: string) => {
    slot += 1;
    return insertLesson(tenants, A, {
      studentId,
      instructorMembershipId: instructorId,
      lessonTypeId,
      start: new Date(Date.now() + (24 + 2 * slot) * HOUR_MS).toISOString(),
    });
  };

  it("filters by audience: an instructor never sees another instructor's rows; school-wide rows reach both", async () => {
    const ingo = await instructor();
    const ina = await instructor();
    const cursor = await head();
    const studentId = await insertStudent(tenants, A, 'Ada Audience');
    await assignInstructor(tenants, A, studentId, ingo.membershipId);
    const lessonId = await lessonOf(studentId, ingo.membershipId);
    const vehicleId = await insertVehicle(tenants, A, 'B-SY 1');
    await addRow('lesson', lessonId, 'upsert', ingo.membershipId);
    await addRow('vehicle', vehicleId, 'upsert', null);
    await addRow('student', studentId, 'upsert', ingo.membershipId);

    const forIngo = await pullAll(ingo, cursor);
    const forIna = await pullAll(ina, cursor);

    expect(summary(forIngo.items)).toEqual([
      { entity: 'lesson', id: lessonId, op: 'upsert' },
      { entity: 'vehicle', id: vehicleId, op: 'upsert' },
      { entity: 'student', id: studentId, op: 'upsert' },
    ]);
    expect(summary(forIna.items)).toEqual([{ entity: 'vehicle', id: vehicleId, op: 'upsert' }]);
    expect(JSON.stringify(forIna)).not.toContain(lessonId);
    expect(JSON.stringify(forIna)).not.toContain(studentId);
  });

  it('joins the current entity state of each upsert row', async () => {
    const ingo = await instructor();
    const cursor = await head();
    const phone = uniquePhone();
    const user = await createUser(tenants, {
      phone,
      memberships: [{ tenant: A, roles: ['student'] }],
    });
    const studentId = await insertStudent(tenants, A, 'Stella State', user.userId);
    await tenants.asSchool(A, (tx) =>
      tx
        .update(students)
        .set({ area: 'Mitte', pickupAddress: 'Torstr. 1', pickupLat: 52.53, pickupLng: 13.4 })
        .where(eq(students.id, studentId)),
    );
    await assignInstructor(tenants, A, studentId, ingo.membershipId, true);
    const lessonId = await lessonOf(studentId, ingo.membershipId);
    const entryId = newId();
    await tenants.asSchool(A, (tx) =>
      tx.insert(progressEntries).values({
        id: entryId,
        schoolId: A.schoolId,
        lessonId,
        studentId,
        syllabusItemId: syllabusItem,
        level: 2,
        note: 'roundabouts',
        version: 3,
      }),
    );
    const vehicleId = await insertVehicle(tenants, A, 'B-SY 2');
    await insertWeekdayAvailability(tenants, A, ingo.membershipId, '08:00', '16:00');
    await addRow('lesson', lessonId, 'upsert', ingo.membershipId);
    await addRow('student', studentId, 'upsert', ingo.membershipId);
    await addRow('progress_entry', entryId, 'upsert', ingo.membershipId);
    await addRow('vehicle', vehicleId, 'upsert', null);
    await addRow('availability', ingo.membershipId, 'upsert', ingo.membershipId);
    await tenants.asSchool(A, (tx) =>
      tx
        .update(lessons)
        .set({ cancelReason: 'later edit', version: 2 })
        .where(eq(lessons.id, lessonId)),
    );

    const { items } = await pullAll(ingo, cursor);

    const [lesson, student, progress, vehicle, availability] = items;
    expect(lesson).toMatchObject({
      entity: 'lesson',
      op: 'upsert',
      data: {
        id: lessonId,
        studentId,
        studentName: 'Stella State',
        instructorMembershipId: ingo.membershipId,
        cancelReason: 'later edit',
        version: 2,
      },
    });
    expect(student).toMatchObject({
      entity: 'student',
      op: 'upsert',
      data: {
        id: studentId,
        fullName: 'Stella State',
        phone,
        licenceClass: 'B',
        area: 'Mitte',
        pickupAddress: 'Torstr. 1',
        pickupLat: 52.53,
        pickupLng: 13.4,
        isPrimary: true,
      },
    });
    expect(progress).toMatchObject({
      entity: 'progress_entry',
      op: 'upsert',
      data: {
        id: entryId,
        lessonId,
        studentId,
        syllabusItemId: syllabusItem,
        level: 2,
        note: 'roundabouts',
        version: 3,
      },
    });
    expect(vehicle).toMatchObject({
      entity: 'vehicle',
      op: 'upsert',
      data: { id: vehicleId, plate: 'B-SY 2', active: true },
    });
    expect(availability).toMatchObject({
      entity: 'availability',
      entityId: ingo.membershipId,
      op: 'upsert',
      data: { instructorMembershipId: ingo.membershipId },
    });
    if (availability?.op === 'upsert' && availability.entity === 'availability') {
      expect(availability.data.items.length).toBeGreaterThan(0);
      expect(availability.data).not.toHaveProperty('timeOff');
    }
    const audited = await tenants.asSchool(A, (tx) =>
      tx
        .select({ action: auditLog.action, actor: auditLog.actorUserId })
        .from(auditLog)
        .where(eq(auditLog.targetId, studentId)),
    );
    expect(audited).toEqual([{ action: 'student.read', actor: ingo.userId }]);
  });

  it('turns rows of entities that are gone into delete and of entities no longer visible into revoke', async () => {
    const ingo = await instructor();
    const ina = await instructor();
    const cursor = await head();
    const archived = await insertStudent(tenants, A, 'Archie Archived');
    await assignInstructor(tenants, A, archived, ingo.membershipId);
    await tenants.asSchool(A, (tx) =>
      tx.update(students).set({ status: 'archived' }).where(eq(students.id, archived)),
    );
    const unassigned = await insertStudent(tenants, A, 'Una Unassigned');
    const handedOver = await lessonOf(unassigned, ina.membershipId);
    const inactive = await insertVehicle(tenants, A, 'B-SY 3', { active: false });
    const missing = newId();
    await addRow('student', archived, 'upsert', ingo.membershipId);
    await addRow('student', unassigned, 'upsert', ingo.membershipId);
    await addRow('lesson', handedOver, 'upsert', ingo.membershipId);
    await addRow('vehicle', inactive, 'upsert', null);
    await addRow('progress_entry', missing, 'upsert', ingo.membershipId);
    await addRow('lesson', missing, 'upsert', ingo.membershipId);
    await addRow('student', unassigned, 'revoke', ingo.membershipId);

    const { items } = await pullAll(ingo, cursor);

    expect(summary(items)).toEqual([
      { entity: 'student', id: archived, op: 'delete' },
      { entity: 'student', id: unassigned, op: 'revoke' },
      { entity: 'lesson', id: handedOver, op: 'revoke' },
      { entity: 'vehicle', id: inactive, op: 'delete' },
      { entity: 'progress_entry', id: missing, op: 'delete' },
      { entity: 'lesson', id: missing, op: 'delete' },
      { entity: 'student', id: unassigned, op: 'revoke' },
    ]);
    for (const item of items) expect(item.data).toBeNull();
  });

  it("shows an assigned student's lesson with another instructor", async () => {
    const ingo = await instructor();
    const ina = await instructor();
    const cursor = await head();
    const studentId = await insertStudent(tenants, A, 'Shared Student');
    await assignInstructor(tenants, A, studentId, ingo.membershipId);
    const lessonId = await lessonOf(studentId, ina.membershipId);
    await addRow('lesson', lessonId, 'upsert', ingo.membershipId);

    const { items } = await pullAll(ingo, cursor);

    expect(summary(items)).toEqual([{ entity: 'lesson', id: lessonId, op: 'upsert' }]);
  });

  it('pages with limit, nextCursor and hasMore', async () => {
    const ingo = await instructor();
    const cursor = await head();
    const ids = [newId(), newId(), newId()];
    for (const id of ids) await addRow('lesson', id, 'delete', ingo.membershipId);

    const first = syncPullResponseSchema.parse(
      (await pull(ingo, { cursor, limit: '2' }).expect(StatusCodes.OK)).body,
    );
    const second = syncPullResponseSchema.parse(
      (await pull(ingo, { cursor: first.nextCursor, limit: '2' }).expect(StatusCodes.OK)).body,
    );
    const empty = syncPullResponseSchema.parse(
      (await pull(ingo, { cursor: second.nextCursor, limit: '2' }).expect(StatusCodes.OK)).body,
    );

    expect(first.items.map((item) => item.entityId)).toEqual(ids.slice(0, 2));
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe(first.items[1]?.seq);
    expect(second.items.map((item) => item.entityId)).toEqual(ids.slice(2));
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBe(second.items[0]?.seq);
    expect(empty).toEqual({ items: [], nextCursor: second.nextCursor, hasMore: false });
  });

  it('starts from the beginning without a cursor and returns cursor "0" for an empty feed', async () => {
    const lonely = await createLogin(tenants, B, ['instructor']);
    const res = await http.get('/v1/sync').set(lonely.headers).expect(StatusCodes.OK);

    expect(res.body).toEqual({ items: [], nextCursor: '0', hasMore: false });
  });

  it("never returns another school's rows", async () => {
    const ingo = await instructor();
    const vehicleOfB = await insertVehicle(tenants, B, 'B-SY 9');
    await addRow('vehicle', vehicleOfB, 'upsert', null, B);

    const { items } = await pullAll(ingo, '0');

    expect(items.map((item) => item.entityId)).not.toContain(vehicleOfB);
  });

  it('rejects office and student callers (no sync.use) and malformed cursors', async () => {
    const office = await createLogin(tenants, A, ['office']);
    const student = await createLogin(tenants, A, ['student']);
    const ingo = await instructor();

    await http.get('/v1/sync').set(office.headers).expect(StatusCodes.FORBIDDEN);
    await http.get('/v1/sync').set(student.headers).expect(StatusCodes.FORBIDDEN);
    const bad = await pull(ingo, { cursor: 'abc' }).expect(StatusCodes.BAD_REQUEST);
    expect(bad.body.error.code).toBe('validation_error');
    await pull(ingo, { limit: '501' }).expect(StatusCodes.BAD_REQUEST);
  });
});
