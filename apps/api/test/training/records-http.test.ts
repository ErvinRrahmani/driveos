import { ProgressRecorded, TestAttemptRecorded } from '@driveos/shared';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import {
  GetTestAttemptStatsQuery,
  RecordProgressCommand,
  UpsertPrivateNoteCommand,
} from '../../src/modules/training/index.js';
import { rmStudentLessons } from '../../src/modules/training/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent, createUser } from '../identity/support.js';
import { expectEvents } from '../support/events.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import {
  assignInstructor,
  createLessonRow,
  createLogin,
  createSyllabus,
  linkGuardianRow,
  type Login,
  principalOf,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const DAY_MS = 86_400_000;

describe('training HTTP: syllabus, progress, test attempts, private notes', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let ingo: Login;
  let ina: Login;
  let office: Login;
  let syllabus: string[];

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
    office = await createLogin(tenants, A, ['office']);
    syllabus = await createSyllabus(tenants, A, ['B01', 'B02', 'B03', 'B04']);
    await createSyllabus(tenants, A, ['A01'], 'A');
    await createSyllabus(tenants, B, ['B01']);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  async function studentTaughtByIngo(): Promise<string> {
    const id = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
    await assignInstructor(tenants, A, id, ingo.membershipId);
    return id;
  }

  let slot = 0;
  async function lessonFor(studentId: string, at?: Date) {
    slot += 1;
    const start = at ?? new Date(Date.now() - 10 * DAY_MS - slot * 2 * 3_600_000);
    return createLessonRow(tenants, A, {
      studentId,
      instructorMembershipId: ingo.membershipId,
      start,
    });
  }

  const recordProgress = (
    studentId: string,
    lessonId: string,
    entries: { syllabusItemId: string; level: number; note: string }[],
  ) =>
    executeAs(
      kernel.app,
      A,
      new RecordProgressCommand(principalOf(A, ingo, ['instructor']), {
        lessonId,
        studentId,
        entries,
      }),
    );

  const auditRows = async (targetId: string) =>
    (
      await system.query<{ action: string; actor_user_id: string }>(
        `select action, actor_user_id from audit_log where target_id = $1 order by at`,
        [targetId],
      )
    ).rows;

  describe('GET /v1/syllabus', () => {
    it('lists the school syllabus ordered by sort order, optionally for one licence class', async () => {
      const res = await http.get('/v1/syllabus?licenceClass=B').set(ingo.headers);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body.items.map((item: { code: string }) => item.code)).toEqual([
        'B01',
        'B02',
        'B03',
        'B04',
      ]);
      expect(res.body.items[0]).toEqual({
        id: syllabus[0],
        licenceClass: 'B',
        code: 'B01',
        title: 'Topic B01',
        sortOrder: 1,
      });
      const all = await http.get('/v1/syllabus').set(authHeaders(A));
      expect(all.body.items).toHaveLength(5);
    });

    it('is readable by students', async () => {
      const student = await createLogin(tenants, A, ['student']);
      expect((await http.get('/v1/syllabus').set(student.headers)).status).toBe(StatusCodes.OK);
    });
  });

  describe('RecordProgressCommand', () => {
    it('upserts one entry per lesson and syllabus item, bumps versions and appends ProgressRecorded', async () => {
      const studentId = await studentTaughtByIngo();
      const lessonId = await lessonFor(studentId);
      const first = await recordProgress(studentId, lessonId, [
        { syllabusItemId: syllabus[0] as string, level: 2, note: 'Mirrors' },
        { syllabusItemId: syllabus[1] as string, level: 1, note: '' },
      ]);
      expect(first.entries.map((entry) => entry.version)).toEqual([1, 1]);
      const again = await recordProgress(studentId, lessonId, [
        { syllabusItemId: syllabus[0] as string, level: 3, note: 'Better' },
      ]);
      expect(again.entries).toEqual([{ id: first.entries[0]?.id, version: 2 }]);

      const rows = await system.query(
        `select syllabus_item_id, level, note, version, recorded_by_membership_id
           from progress_entries where student_id = $1 order by level desc`,
        [studentId],
      );
      expect(rows.rows).toEqual([
        {
          syllabus_item_id: syllabus[0],
          level: 3,
          note: 'Better',
          version: 2,
          recorded_by_membership_id: ingo.membershipId,
        },
        {
          syllabus_item_id: syllabus[1],
          level: 1,
          note: '',
          version: 1,
          recorded_by_membership_id: ingo.membershipId,
        },
      ]);
      const events = await expectEvents(db, { type: ProgressRecorded, aggregateId: studentId });
      expect(events).toHaveLength(2);
      expect(events[1]?.payload).toEqual({
        lessonId,
        studentId,
        instructorMembershipId: ingo.membershipId,
        entries: [
          {
            progressEntryId: first.entries[0]?.id,
            syllabusItemId: syllabus[0],
            level: 3,
            version: 2,
          },
        ],
      });
      const version = await system.query(`select version from students where id = $1`, [studentId]);
      expect(events[1]?.aggregateVersion).toBe(version.rows[0].version);
    });

    it('refuses unknown syllabus items, duplicates and lessons of another student', async () => {
      const studentId = await studentTaughtByIngo();
      const other = await studentTaughtByIngo();
      const lessonId = await lessonFor(studentId);
      await expect(
        recordProgress(studentId, lessonId, [
          { syllabusItemId: '0192f000-0000-7000-8000-00000000dead', level: 2, note: '' },
        ]),
      ).rejects.toMatchObject({ status: StatusCodes.BAD_REQUEST });
      await expect(
        recordProgress(studentId, lessonId, [
          { syllabusItemId: syllabus[0] as string, level: 2, note: '' },
          { syllabusItemId: syllabus[0] as string, level: 3, note: '' },
        ]),
      ).rejects.toMatchObject({ status: StatusCodes.BAD_REQUEST });
      await expect(
        recordProgress(other, lessonId, [
          { syllabusItemId: syllabus[0] as string, level: 2, note: '' },
        ]),
      ).rejects.toMatchObject({ status: StatusCodes.NOT_FOUND });
      const count = await system.query(
        `select count(*)::int as n from progress_entries where student_id = any($1)`,
        [[studentId, other]],
      );
      expect(count.rows[0].n).toBe(0);
    });
  });

  describe('GET /v1/students/:id/progress', () => {
    it('summarises each syllabus item with the latest level, last note and lesson count, plus progressPct', async () => {
      const studentId = await studentTaughtByIngo();
      const early = await lessonFor(studentId, new Date(Date.now() - 3 * DAY_MS));
      const late = await lessonFor(studentId, new Date(Date.now() - DAY_MS));
      await tenants.asSchool(A, (tx) =>
        tx.insert(rmStudentLessons).values([
          {
            schoolId: A.schoolId,
            lessonId: early,
            studentId,
            instructorMembershipId: ina.membershipId,
            startAt: new Date('2026-10-01T08:00:00Z'),
            endAt: new Date('2026-10-01T09:00:00Z'),
            status: 'completed',
          },
          {
            schoolId: A.schoolId,
            lessonId: late,
            studentId,
            instructorMembershipId: ingo.membershipId,
            startAt: new Date('2026-10-05T08:00:00Z'),
            endAt: new Date('2026-10-05T09:00:00Z'),
            status: 'completed',
          },
        ]),
      );
      await recordProgress(studentId, late, [
        { syllabusItemId: syllabus[0] as string, level: 4, note: '' },
      ]);
      await recordProgress(studentId, early, [
        { syllabusItemId: syllabus[0] as string, level: 2, note: 'Mirrors first' },
        { syllabusItemId: syllabus[1] as string, level: 2, note: 'Clutch control' },
      ]);

      const res = await http.get(`/v1/students/${studentId}/progress`).set(ingo.headers);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ studentId, licenceClass: 'B', progressPct: 30 });
      expect(res.body.syllabus.map((item: { code: string }) => item.code)).toEqual([
        'B01',
        'B02',
        'B03',
        'B04',
      ]);
      expect(res.body.syllabus[0]).toMatchObject({
        syllabusItemId: syllabus[0],
        level: 4,
        lastNote: 'Mirrors first',
        lessonCount: 2,
      });
      expect(res.body.syllabus[1]).toMatchObject({ level: 2, lessonCount: 1 });
      expect(res.body.syllabus[2]).toMatchObject({ level: null, lastNote: null, lessonCount: 0 });
      expect(res.body.entries).toHaveLength(3);
      expect(res.body.entries[0]).toMatchObject({
        lessonId: early,
        lessonStart: '2026-10-01T08:00:00.000Z',
        instructorName: expect.stringMatching(/^User /),
        level: 2,
        version: 1,
      });
      expect(res.body.entries[2]).toMatchObject({
        lessonId: late,
        lessonStart: '2026-10-05T08:00:00.000Z',
      });
      expect(await auditRows(studentId)).toEqual([
        { action: 'student.progress.read', actor_user_id: ingo.userId },
      ]);
    });

    it('lets the student and a consented parent read it (no audit), hides it from others', async () => {
      const studentLogin = await createLogin(tenants, A, ['student']);
      const studentId = await createStudent(tenants, A, {
        dateOfBirth: '2010-01-01',
        userId: studentLogin.userId,
      });
      const parent = await createLogin(tenants, A, ['parent']);
      const pendingParent = await createLogin(tenants, A, ['parent']);
      await linkGuardianRow(tenants, A, studentId, parent.userId, new Date());
      await linkGuardianRow(tenants, A, studentId, pendingParent.userId, null);

      expect(
        (await http.get(`/v1/students/${studentId}/progress`).set(studentLogin.headers)).status,
      ).toBe(StatusCodes.OK);
      expect(
        (await http.get(`/v1/students/${studentId}/progress`).set(parent.headers)).status,
      ).toBe(StatusCodes.OK);
      expect(
        (await http.get(`/v1/students/${studentId}/progress`).set(pendingParent.headers)).status,
      ).toBe(StatusCodes.NOT_FOUND);
      expect((await http.get(`/v1/students/${studentId}/progress`).set(ina.headers)).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      expect(await auditRows(studentId)).toEqual([]);
    });
  });

  describe('POST /v1/students/:id/test-attempts', () => {
    it('records an attempt for an assigned instructor, appends TestAttemptRecorded and lists it in progress', async () => {
      const studentId = await studentTaughtByIngo();
      const res = await http
        .post(`/v1/students/${studentId}/test-attempts`)
        .set(ingo.headers)
        .send({ kind: 'theory', takenOn: '2026-09-28', result: 'passed' });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({ id: expect.any(String), version: 1 });
      const events = await expectEvents(db, { type: TestAttemptRecorded, aggregateId: studentId });
      expect(events).toHaveLength(1);
      const [event] = events;
      expect(event?.payload).toEqual({
        testAttemptId: res.body.id,
        studentId,
        kind: 'theory',
        takenOn: '2026-09-28',
        result: 'passed',
      });
      const progress = await http.get(`/v1/students/${studentId}/progress`).set(ingo.headers);
      expect(progress.body.testAttempts).toEqual([
        { id: res.body.id, kind: 'theory', takenOn: '2026-09-28', result: 'passed', notes: '' },
      ]);
    });

    it('lets office record for anyone, refuses unassigned instructors (404) and students (403)', async () => {
      const studentId = await studentTaughtByIngo();
      const body = { kind: 'practical', takenOn: '2026-10-01', result: 'failed', notes: 'Speed' };
      expect(
        (await http.post(`/v1/students/${studentId}/test-attempts`).set(office.headers).send(body))
          .status,
      ).toBe(StatusCodes.CREATED);
      expect(
        (await http.post(`/v1/students/${studentId}/test-attempts`).set(ina.headers).send(body))
          .status,
      ).toBe(StatusCodes.NOT_FOUND);
      const student = await createLogin(tenants, A, ['student']);
      expect(
        (await http.post(`/v1/students/${studentId}/test-attempts`).set(student.headers).send(body))
          .status,
      ).toBe(StatusCodes.FORBIDDEN);
      expect(
        (
          await http
            .post(`/v1/students/${studentId}/test-attempts`)
            .set(office.headers)
            .send({ ...body, result: 'maybe' })
        ).status,
      ).toBe(StatusCodes.BAD_REQUEST);
    });

    it('refuses anonymized students', async () => {
      const studentId = await studentTaughtByIngo();
      await system.query(`update students set status = 'anonymized' where id = $1`, [studentId]);
      const res = await http
        .post(`/v1/students/${studentId}/test-attempts`)
        .set(office.headers)
        .send({ kind: 'theory', takenOn: '2026-09-28', result: 'passed' });
      expect(res.status).toBe(StatusCodes.CONFLICT);
    });
  });

  describe('GetTestAttemptStatsQuery', () => {
    it('counts attempts and passes per period and kind within the range', async () => {
      const tenantsC = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
      const C = tenantsC.A;
      const studentId = await createStudent(tenantsC, C, { dateOfBirth: '2000-01-01' });
      const record = (kind: string, takenOn: string, result: string) =>
        http
          .post(`/v1/students/${studentId}/test-attempts`)
          .set(authHeaders(C))
          .send({ kind, takenOn, result })
          .expect(StatusCodes.CREATED);
      await record('theory', '2026-09-30', 'failed');
      await record('theory', '2026-10-01', 'failed');
      await record('theory', '2026-10-02', 'passed');
      await record('practical', '2026-10-20', 'passed');
      await record('practical', '2026-11-01', 'passed');

      const monthly = await executeAs(
        kernel.app,
        C,
        new GetTestAttemptStatsQuery({ from: '2026-10-01', to: '2026-10-31', bucket: 'month' }),
      );
      expect(monthly).toEqual([
        { period: '2026-10-01', kind: 'practical', attempts: 1, passed: 1 },
        { period: '2026-10-01', kind: 'theory', attempts: 2, passed: 1 },
      ]);
      const daily = await executeAs(
        kernel.app,
        C,
        new GetTestAttemptStatsQuery({ from: '2026-09-30', to: '2026-10-01', bucket: 'day' }),
      );
      expect(daily).toEqual([
        { period: '2026-09-30', kind: 'theory', attempts: 1, passed: 0 },
        { period: '2026-10-01', kind: 'theory', attempts: 1, passed: 0 },
      ]);
      const weekly = await executeAs(
        kernel.app,
        C,
        new GetTestAttemptStatsQuery({ from: '2026-09-28', to: '2026-10-04', bucket: 'week' }),
      );
      expect(weekly).toEqual([{ period: '2026-09-28', kind: 'theory', attempts: 3, passed: 1 }]);
      const fromB = await executeAs(
        kernel.app,
        B,
        new GetTestAttemptStatsQuery({ from: '2026-01-01', to: '2026-12-31', bucket: 'month' }),
      );
      expect(fromB).toEqual([]);
      await tenantsC.close();
    });
  });

  describe('private notes', () => {
    it('lets an assigned instructor write (last write wins) and read them back, audited', async () => {
      const studentId = await studentTaughtByIngo();
      const lessonId = await lessonFor(studentId);
      const first = await http
        .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
        .set(ingo.headers)
        .send({ body: 'Nervous at roundabouts' });
      expect(first.status, JSON.stringify(first.body)).toBe(StatusCodes.OK);
      expect(first.body).toEqual({ id: expect.any(String), version: 1 });
      const second = await http
        .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
        .set(ingo.headers)
        .send({ body: 'Calmer now' });
      expect(second.body).toEqual({ id: first.body.id, version: 2 });

      const res = await http.get(`/v1/students/${studentId}/private-notes`).set(ingo.headers);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body.items).toEqual([
        {
          id: first.body.id,
          lessonId,
          authorMembershipId: ingo.membershipId,
          authorName: expect.stringMatching(/^User /),
          body: 'Calmer now',
          version: 2,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ]);
      expect(await auditRows(studentId)).toContainEqual({
        action: 'private_notes.read',
        actor_user_id: ingo.userId,
      });
      const office = await http.get(`/v1/students/${studentId}/private-notes`).set(authHeaders(A));
      expect(office.body.items).toHaveLength(1);
    });

    it('keeps one note per author and lesson', async () => {
      const studentId = await studentTaughtByIngo();
      const lessonId = await lessonFor(studentId);
      await http
        .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
        .set(ingo.headers)
        .send({ body: 'Ingo says' })
        .expect(StatusCodes.OK);
      await http
        .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
        .set(authHeaders(A))
        .send({ body: 'Owner says' })
        .expect(StatusCodes.OK);
      const res = await http.get(`/v1/students/${studentId}/private-notes`).set(authHeaders(A));
      expect(res.body.items.map((note: { body: string }) => note.body).sort()).toEqual([
        'Ingo says',
        'Owner says',
      ]);
    });

    it('hides notes of unassigned students from instructors and refuses students, parents and office writes', async () => {
      const studentLogin = await createLogin(tenants, A, ['student']);
      const studentId = await createStudent(tenants, A, {
        dateOfBirth: '2010-01-01',
        userId: studentLogin.userId,
      });
      await assignInstructor(tenants, A, studentId, ingo.membershipId);
      const parent = await createLogin(tenants, A, ['parent']);
      await linkGuardianRow(tenants, A, studentId, parent.userId, new Date());
      const lessonId = await lessonFor(studentId);

      expect(
        (await http.get(`/v1/students/${studentId}/private-notes`).set(ina.headers)).status,
      ).toBe(StatusCodes.NOT_FOUND);
      expect(
        (
          await http
            .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
            .set(ina.headers)
            .send({ body: 'x' })
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
      for (const caller of [studentLogin, parent]) {
        expect(
          (await http.get(`/v1/students/${studentId}/private-notes`).set(caller.headers)).status,
        ).toBe(StatusCodes.FORBIDDEN);
        expect(
          (
            await http
              .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
              .set(caller.headers)
              .send({ body: 'x' })
          ).status,
        ).toBe(StatusCodes.FORBIDDEN);
      }
      expect(
        (
          await http
            .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
            .set(office.headers)
            .send({ body: 'x' })
        ).status,
      ).toBe(StatusCodes.FORBIDDEN);
    });

    it('refuses a lesson of another student', async () => {
      const studentId = await studentTaughtByIngo();
      const other = await studentTaughtByIngo();
      const lessonId = await lessonFor(other);
      const res = await http
        .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
        .set(ingo.headers)
        .send({ body: 'Wrong lesson' });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    it('is reachable through UpsertPrivateNoteCommand with a client id (sync)', async () => {
      const studentId = await studentTaughtByIngo();
      const lessonId = await lessonFor(studentId);
      const noteId = '0192f000-0108-7000-8000-0000000000aa';
      const result = await executeAs(
        kernel.app,
        A,
        new UpsertPrivateNoteCommand(principalOf(A, ingo, ['instructor']), {
          noteId,
          lessonId,
          studentId,
          body: 'From the car',
        }),
      );
      expect(result).toEqual({ id: noteId, version: 1 });
    });
  });

  describe('students and parents never receive private notes', () => {
    const SENTINEL = 'PRIVATE-NOTE-SENTINEL-7f3a';

    it('from any training route, with or without read grants', async () => {
      const studentUser = await createUser(tenants, {
        memberships: [{ tenant: A, roles: ['student'] }],
      });
      const studentId = await createStudent(tenants, A, {
        dateOfBirth: '2010-01-01',
        userId: studentUser.userId,
      });
      await assignInstructor(tenants, A, studentId, ingo.membershipId);
      const lessonId = await lessonFor(studentId);
      await recordProgress(studentId, lessonId, [
        { syllabusItemId: syllabus[0] as string, level: 3, note: 'Visible note' },
      ]);
      await http
        .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
        .set(ingo.headers)
        .send({ body: SENTINEL })
        .expect(StatusCodes.OK);
      const parentUser = await createUser(tenants, {
        memberships: [{ tenant: A, roles: ['parent'] }],
      });
      const link = await linkGuardianRow(tenants, A, studentId, parentUser.userId, new Date());

      const routes: [string, string, Record<string, unknown>?][] = [
        ['get', '/v1/students'],
        ['get', `/v1/students/${studentId}`],
        ['get', `/v1/students/${studentId}/instructors`],
        ['get', `/v1/students/${studentId}/progress`],
        ['get', `/v1/students/${studentId}/private-notes`],
        ['get', '/v1/syllabus'],
        ['put', `/v1/students/${studentId}/private-notes/${lessonId}`, { body: 'overwrite' }],
        ['post', `/v1/students/${studentId}/export`],
        [
          'post',
          `/v1/students/${studentId}/test-attempts`,
          { kind: 'theory', takenOn: '2026-10-01', result: 'passed' },
        ],
        ['post', `/v1/guardians/${link}/consent`, { consentTextVersion: 'v2' }],
        ['patch', `/v1/students/${studentId}`, { area: 'Mitte' }],
        ['post', `/v1/students/${studentId}/archive`, {}],
        ['delete', `/v1/students/${studentId}`],
      ];
      const callers = [
        authHeadersFor(A, {
          roles: ['student'],
          userId: studentUser.userId,
          membershipId: studentUser.membershipIds[0],
        }),
        authHeadersFor(A, {
          roles: ['parent'],
          userId: parentUser.userId,
          membershipId: parentUser.membershipIds[0],
        }),
      ];
      const granted = await createLogin(
        tenants,
        A,
        ['student'],
        ['students.read.own', 'progress.read.own'],
      );
      await system.query(`update students set user_id = $1 where id = $2`, [
        granted.userId,
        await createStudent(tenants, A, { dateOfBirth: '2010-01-01' }),
      ]);
      callers.push(granted.headers);
      const seen: string[] = [];
      for (const headers of callers) {
        for (const [method, path, body] of routes) {
          const call = (http as unknown as Record<string, (p: string) => request.Test>)[method]?.(
            path,
          );
          if (!call) throw new Error(method);
          const res = await call.set(headers).send(body ?? {});
          seen.push(`${method} ${path} ${res.status}`);
          expect(res.text, `${method} ${path}`).not.toContain(SENTINEL);
        }
      }
      expect(seen.some((line) => line.endsWith('/progress 200'))).toBe(true);
      const stored = await system.query(`select body from private_notes where student_id = $1`, [
        studentId,
      ]);
      expect(stored.rows).toEqual([{ body: SENTINEL }]);
    });
  });
});
