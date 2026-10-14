import { randomUUID } from 'node:crypto';
import {
  CashPaymentRecorded,
  LessonBooked,
  type SyncOpResult,
  syncPushResponseSchema,
} from '@driveos/shared';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { ledgerEntries } from '../../src/modules/billing/infra/schema.js';
import { lessons, syncOperations } from '../../src/modules/scheduling/infra/schema.js';
import { privateNotes, progressEntries } from '../../src/modules/training/infra/schema.js';
import { createPriceItemRow } from '../billing/support.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { assignInstructor, createLogin, createSyllabus, type Login } from '../training/support.js';
import {
  insertLesson,
  insertLessonType,
  insertStudent,
  insertWeekdayAvailability,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const HOUR_MS = 3_600_000;
const PICKUP = { pickupAddress: 'Torstr. 1', pickupLat: 52.53, pickupLng: 13.4 };
const CLIENT_AT = '2030-01-01T08:00:00.000Z';

type Op = Record<string, unknown>;

describe('POST /v1/sync (apply offline operations)', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let ingo: Login;
  let ina: Login;
  let stellaLogin: Login;
  let stella: string;
  let sam: string;
  let standard: string;
  let syllabus: string[];
  let packageItem: string;
  let pastSlot = 0;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A } = tenants);
    http = request(kernel.app.getHttpServer());
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    stellaLogin = await createLogin(tenants, A, ['student']);
    stella = await insertStudent(tenants, A, 'Stella Student', stellaLogin.userId);
    sam = await insertStudent(tenants, A, 'Sam Schulz');
    await assignInstructor(tenants, A, stella, ingo.membershipId);
    await assignInstructor(tenants, A, sam, ina.membershipId);
    await credit(stella, 6000);
    await credit(sam, 6000);
    standard = await insertLessonType(tenants, A);
    syllabus = await createSyllabus(tenants, A, ['B01', 'B02']);
    packageItem = await createPriceItemRow(tenants, A, { amountMinor: 60_000 });
    await insertWeekdayAvailability(tenants, A, ingo.membershipId);
    await insertWeekdayAvailability(tenants, A, ina.membershipId);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  async function credit(studentId: string, minutes: number): Promise<void> {
    await tenants.asSchool(A, (tx) =>
      tx.insert(ledgerEntries).values({
        schoolId: A.schoolId,
        studentId,
        entryType: 'adjustment',
        minutes,
        note: 'test credit',
        createdByMembershipId: A.ownerMembershipId,
      }),
    );
  }

  function push(headers: Record<string, string>, ops: Op[]) {
    return http.post('/v1/sync').set(headers).send({ ops });
  }

  async function pushOk(headers: Record<string, string>, ops: Op[]): Promise<SyncOpResult[]> {
    const res = await push(headers, ops);
    expect(res.status, res.text).toBe(StatusCodes.OK);
    return syncPushResponseSchema.parse(res.body).results;
  }

  const op = (type: string, payload: Op, baseVersion: number | null = null): Op => ({
    opId: randomUUID(),
    clientAt: CLIENT_AT,
    type,
    baseVersion,
    payload,
  });

  const createOp = (start: string, studentId = stella, lessonId = newId()) =>
    op('lesson.create', {
      lessonId,
      studentId,
      lessonTypeId: standard,
      vehicleId: null,
      start,
      ...PICKUP,
    });

  const progressOp = (
    lessonId: string,
    progressEntryId: string,
    level: number,
    clientAt = CLIENT_AT,
  ) => ({
    ...op('progress.upsert', {
      progressEntryId,
      lessonId,
      syllabusItemId: syllabus[0],
      level,
      note: `level ${level}`,
    }),
    clientAt,
  });

  const noteOp = (lessonId: string, privateNoteId: string, body: string, clientAt = CLIENT_AT) => ({
    ...op('private_note.upsert', { privateNoteId, lessonId, body }),
    clientAt,
  });

  const cashOp = (paymentId = newId()) =>
    op('payment.cash', {
      paymentId,
      studentId: stella,
      priceItemId: packageItem,
      amountMinor: 60_000,
      currency: 'EUR',
    });

  function pastLesson(instructor = ingo.membershipId, studentId = stella): Promise<string> {
    pastSlot += 1;
    return insertLesson(tenants, A, {
      studentId,
      instructorMembershipId: instructor,
      lessonTypeId: standard,
      start: new Date(Date.now() - pastSlot * 2 * HOUR_MS).toISOString(),
    });
  }

  async function count(table: string): Promise<number> {
    const rows = await tenants.asSchool(A, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`),
    );
    return Number(rows.rows[0]?.n);
  }

  async function snapshot() {
    return {
      lessons: await count('lessons'),
      ledger: await count('ledger_entries'),
      payments: await count('payments'),
      progress: await count('progress_entries'),
      notes: await count('private_notes'),
      syncOperations: await count('sync_operations'),
      changeFeed: await count('change_feed'),
      outbox: (await expectEvents(db, { schoolId: A.schoolId })).length,
    };
  }

  async function lessonRow(id: string) {
    const [row] = await tenants.asSchool(A, (tx) =>
      tx.select().from(lessons).where(eq(lessons.id, id)),
    );
    return row;
  }

  it('books a lesson with the client id, booked via sync, and appends LessonBooked', async () => {
    const before = await snapshot();
    const create = createOp('2030-01-07T09:00:00.000Z');
    const lessonId = (create.payload as { lessonId: string }).lessonId;

    const [result] = await pushOk(ingo.headers, [create]);

    expect(result).toEqual({
      opId: create.opId,
      status: 'applied',
      id: lessonId,
      version: 1,
      error: null,
      serverState: null,
    });
    const row = await lessonRow(lessonId);
    expect(row).toMatchObject({
      instructorMembershipId: ingo.membershipId,
      studentId: stella,
      bookedVia: 'sync',
      status: 'booked',
    });
    const booked = await expectEvents(db, { type: LessonBooked, aggregateId: lessonId });
    expect(booked).toHaveLength(1);
    expect(booked[0]?.payload.bookedVia).toBe('sync');
    const after = await snapshot();
    expect(after.changeFeed).toBe(before.changeFeed);
    const [stored] = await tenants.asSchool(A, (tx) =>
      tx
        .select()
        .from(syncOperations)
        .where(eq(syncOperations.opId, create.opId as string)),
    );
    expect(stored).toMatchObject({
      membershipId: ingo.membershipId,
      type: 'lesson.create',
      status: 'applied',
    });
    expect(stored?.result).toMatchObject({ ...result, clientAt: CLIENT_AT });
  });

  it('replaying the same batch is a no-op with identical results', async () => {
    const past = await pastLesson();
    const toCancel = await insertLesson(tenants, A, {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: '2030-01-08T15:00:00.000Z',
    });
    const batch = [
      createOp('2030-01-08T09:00:00.000Z'),
      cashOp(),
      progressOp(past, newId(), 3),
      noteOp(past, newId(), 'Brakes late'),
      op('lesson.complete', { lessonId: past }, 1),
      op('lesson.cancel', { lessonId: toCancel, reason: 'Sick' }, 1),
      op('lesson.cancel', { lessonId: newId() }, 1),
    ];

    const first = await push(ingo.headers, batch);
    expect(first.status, first.text).toBe(StatusCodes.OK);
    const statuses = (first.body as { results: SyncOpResult[] }).results.map((r) => r.status);
    expect(statuses).toEqual([
      'applied',
      'applied',
      'applied',
      'applied',
      'applied',
      'applied',
      'rejected',
    ]);
    const before = await snapshot();

    const second = await push(ingo.headers, batch);

    expect(second.status).toBe(StatusCodes.OK);
    expect(second.body).toEqual(first.body);
    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a stale base_version with the server state and leaves the lesson unchanged', async () => {
    const lessonId = await insertLesson(tenants, A, {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: '2030-01-09T09:00:00.000Z',
    });
    const moved = await http
      .patch(`/v1/lessons/${lessonId}`)
      .set(authHeaders(A))
      .send({ start: '2030-01-09T10:00:00.000Z' });
    expect(moved.status, moved.text).toBe(StatusCodes.OK);
    const before = await snapshot();

    const stale = op('lesson.move', { lessonId, start: '2030-01-09T13:00:00.000Z' }, 1);
    const [result] = await pushOk(ingo.headers, [stale]);

    expect(result).toMatchObject({
      opId: stale.opId,
      status: 'rejected',
      id: null,
      version: null,
      error: { code: 'version_conflict', message: expect.any(String) },
    });
    expect(result?.serverState).toMatchObject({
      id: lessonId,
      version: 2,
      start: '2030-01-09T10:00:00.000Z',
      status: 'booked',
    });
    expect((await lessonRow(lessonId))?.version).toBe(2);
    const after = await snapshot();
    expect({ ...after, syncOperations: before.syncOperations }).toEqual(before);
    expect(after.syncOperations).toBe(before.syncOperations + 1);

    const replayed = await push(ingo.headers, [stale]);
    expect(JSON.stringify(replayed.body)).toBe(JSON.stringify({ results: [result] }));
    expect(await snapshot()).toEqual(after);
  });

  it('reports version_conflict for a stale op on a lesson cancelled elsewhere', async () => {
    const lessonId = await insertLesson(tenants, A, {
      studentId: stella,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: '2030-01-09T15:00:00.000Z',
    });
    const cancelled = await http
      .post(`/v1/lessons/${lessonId}/cancel`)
      .set(authHeaders(A))
      .send({ reason: 'Office' });
    expect(cancelled.status, cancelled.text).toBe(StatusCodes.OK);

    const [result] = await pushOk(ingo.headers, [
      op('lesson.cancel', { lessonId, reason: 'Offline' }, 1),
    ]);

    expect(result?.status).toBe('rejected');
    expect(result?.error?.code).toBe('version_conflict');
    expect(result?.serverState).toMatchObject({ id: lessonId, status: 'cancelled', version: 2 });
  });

  it('returns a booking conflict per op while later ops still apply', async () => {
    const existing = await insertLesson(tenants, A, {
      studentId: sam,
      instructorMembershipId: ingo.membershipId,
      lessonTypeId: standard,
      start: '2030-01-10T09:00:00.000Z',
    });
    const before = await snapshot();
    const clash = createOp('2030-01-10T09:30:00.000Z');
    const later = createOp('2030-01-10T12:00:00.000Z');
    const clashId = (clash.payload as { lessonId: string }).lessonId;
    const laterId = (later.payload as { lessonId: string }).lessonId;

    const [rejected, applied] = await pushOk(ingo.headers, [clash, later]);

    expect(rejected).toMatchObject({
      opId: clash.opId,
      status: 'rejected',
      id: null,
      version: null,
      error: { code: 'lesson_conflict', message: expect.any(String) },
    });
    expect(rejected?.serverState).toMatchObject({
      id: existing,
      start: '2030-01-10T09:00:00.000Z',
    });
    expect(applied).toMatchObject({ opId: later.opId, status: 'applied', id: laterId, version: 1 });
    expect(await lessonRow(clashId)).toBeUndefined();
    expect(await lessonRow(laterId)).toBeDefined();
    const after = await snapshot();
    expect(after.lessons).toBe(before.lessons + 1);
    expect(after.ledger).toBe(before.ledger + 1);
    expect(await expectEvents(db, { type: LessonBooked, aggregateId: clashId })).toHaveLength(0);
    expect(await expectEvents(db, { type: LessonBooked, aggregateId: laterId })).toHaveLength(1);
  });

  it('applies progress last-write-wins in arrival order, ignoring clientAt', async () => {
    const lessonId = await pastLesson();
    const entryId = newId();

    const results = await pushOk(ingo.headers, [
      progressOp(lessonId, entryId, 2, '2030-01-01T10:00:00.000Z'),
      progressOp(lessonId, entryId, 4, '2030-01-01T09:00:00.000Z'),
    ]);

    expect(results.map((r) => [r.status, r.id, r.version])).toEqual([
      ['applied', entryId, 1],
      ['applied', entryId, 2],
    ]);
    const entry = async () =>
      (
        await tenants.asSchool(A, (tx) =>
          tx.select().from(progressEntries).where(eq(progressEntries.id, entryId)),
        )
      )[0];
    expect(await entry()).toMatchObject({ level: 4, note: 'level 4', version: 2 });

    const [third] = await pushOk(ingo.headers, [
      progressOp(lessonId, entryId, 3, '2029-12-31T00:00:00.000Z'),
    ]);
    expect(third).toMatchObject({ status: 'applied', id: entryId, version: 3 });
    expect(await entry()).toMatchObject({ level: 3, version: 3 });
  });

  it('applies private notes last-write-wins in arrival order, ignoring clientAt', async () => {
    const lessonId = await pastLesson();
    const noteId = newId();

    const results = await pushOk(ingo.headers, [
      noteOp(lessonId, noteId, 'First', '2030-01-01T10:00:00.000Z'),
      noteOp(lessonId, noteId, 'Second', '2030-01-01T09:00:00.000Z'),
    ]);
    expect(results.map((r) => [r.status, r.id, r.version])).toEqual([
      ['applied', noteId, 1],
      ['applied', noteId, 2],
    ]);
    const [third] = await pushOk(ingo.headers, [
      noteOp(lessonId, noteId, 'Third', '2029-12-31T00:00:00.000Z'),
    ]);
    expect(third).toMatchObject({ status: 'applied', id: noteId, version: 3 });
    const [row] = await tenants.asSchool(A, (tx) =>
      tx.select().from(privateNotes).where(eq(privateNotes.id, noteId)),
    );
    expect(row).toMatchObject({ body: 'Third', version: 3, authorMembershipId: ingo.membershipId });
  });

  it('records a cash payment once and replays it', async () => {
    const paymentId = newId();
    const cash = cashOp(paymentId);
    const [first] = await pushOk(ingo.headers, [cash]);
    expect(first).toMatchObject({ status: 'applied', id: paymentId, version: 1, error: null });
    const before = await snapshot();

    const [again] = await pushOk(ingo.headers, [cash]);

    expect(again).toEqual(first);
    expect(await snapshot()).toEqual(before);
    expect(
      await expectEvents(db, { type: CashPaymentRecorded, aggregateId: paymentId }),
    ).toHaveLength(1);
  });

  it('rolls back only the failing op when it fails half-way through its writes', async () => {
    const paymentId = newId();
    await pushOk(ingo.headers, [cashOp(paymentId)]);
    const invoices = await count('invoices');
    const before = await snapshot();
    const duplicate = cashOp(paymentId);
    const later = createOp('2030-01-14T15:00:00.000Z');

    const [rejected, applied] = await pushOk(ingo.headers, [duplicate, later]);

    expect(rejected).toMatchObject({
      opId: duplicate.opId,
      status: 'rejected',
      error: { code: 'conflict' },
      serverState: null,
    });
    expect(applied?.status).toBe('applied');
    expect(await count('invoices')).toBe(invoices);
    const after = await snapshot();
    expect(after.payments).toBe(before.payments);
    expect(after.lessons).toBe(before.lessons + 1);
  });

  it("rejects per op what the instructor may not do, without leaking another diary's lesson", async () => {
    const inasLesson = await insertLesson(tenants, A, {
      studentId: sam,
      instructorMembershipId: ina.membershipId,
      lessonTypeId: standard,
      start: '2030-01-11T09:00:00.000Z',
    });
    const notAssigned = createOp('2030-01-11T13:00:00.000Z', sam);
    const othersLesson = op('lesson.cancel', { lessonId: inasLesson }, 1);
    const fine = createOp('2030-01-11T15:00:00.000Z');

    const [forbiddenResult, hidden, applied] = await pushOk(ingo.headers, [
      notAssigned,
      othersLesson,
      fine,
    ]);

    expect(forbiddenResult).toMatchObject({
      status: 'rejected',
      error: { code: 'forbidden' },
      serverState: null,
    });
    expect(hidden).toMatchObject({
      status: 'rejected',
      error: { code: 'not_found' },
      serverState: null,
    });
    expect(applied?.status).toBe('applied');
    expect((await lessonRow(inasLesson))?.status).toBe('booked');
  });

  it('rejects an op id already used by another member without applying it', async () => {
    const create = createOp('2030-01-14T09:00:00.000Z');
    await pushOk(ingo.headers, [create]);
    const before = await snapshot();

    const [result] = await pushOk(ina.headers, [create]);

    expect(result).toMatchObject({
      opId: create.opId,
      status: 'rejected',
      id: null,
      error: { code: 'op_id_reused' },
      serverState: null,
    });
    expect(await snapshot()).toEqual(before);
  });

  it('needs sync.use and a valid batch', async () => {
    const student = await push(stellaLogin.headers, [createOp('2030-01-14T13:00:00.000Z')]);
    expect(student.status).toBe(StatusCodes.FORBIDDEN);
    const empty = await push(ingo.headers, []);
    expect(empty.status).toBe(StatusCodes.BAD_REQUEST);
  });
});
