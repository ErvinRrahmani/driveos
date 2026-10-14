import {
  GuardianConsentGiven,
  GuardianLinked,
  InstructorAssigned,
  InstructorUnassigned,
  StudentArchived,
  StudentCreated,
  StudentEnrolled,
} from '@driveos/shared';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent, createUser } from '../identity/support.js';
import { expectEvents, expectNoEvent } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import {
  assignInstructor,
  createLessonRow,
  createLogin,
  dateYearsAgo,
  linkGuardianRow,
  type Login,
  studentBody,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const DAY_MS = 86_400_000;

describe('training HTTP: students, enrolments, archive, instructors, guardians', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let ingo: Login;
  let ina: Login;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  async function create(body: Record<string, unknown> = studentBody(), as = authHeaders(A)) {
    const res = await http.post('/v1/students').set(as).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    return res.body as { id: string; version: number };
  }

  const auditRows = async (targetId: string) =>
    (
      await system.query<{ action: string; actor_user_id: string }>(
        `select action, actor_user_id from audit_log where target_id = $1 order by at`,
        [targetId],
      )
    ).rows;

  describe('POST /v1/students', () => {
    it('creates an active student without a user, and emits StudentCreated', async () => {
      const { id, version } = await create();
      expect(version).toBe(1);
      const row = (
        await system.query(
          `select full_name, user_id, status, version, licence_class from students where id = $1`,
          [id],
        )
      ).rows[0];
      expect(row).toEqual({
        full_name: 'Selin Sommer',
        user_id: null,
        status: 'active',
        version: 1,
        licence_class: 'B',
      });
      const [event] = await expectEvents(db, { type: StudentCreated, aggregateId: id });
      expect(event).toMatchObject({
        aggregateType: 'student',
        aggregateVersion: 1,
        payload: { studentId: id, userId: null, fullName: 'Selin Sommer', status: 'active' },
      });
    });

    it('assigns the primary instructor and opens the first enrolment in the same transaction', async () => {
      const { id, version } = await create(
        studentBody({
          primaryInstructorMembershipId: ingo.membershipId,
          enrolment: { courseName: 'Class B course', licenceClass: 'B' },
        }),
      );
      expect(version).toBe(3);
      const events = await expectEvents(db, { aggregateType: 'student', aggregateId: id });
      expect(events.map((e) => [e.type, e.aggregateVersion])).toEqual([
        ['StudentCreated', 1],
        ['InstructorAssigned', 2],
        ['StudentEnrolled', 3],
      ]);
      expect(events[1]?.payload).toMatchObject({
        studentId: id,
        instructorMembershipId: ingo.membershipId,
        isPrimary: true,
      });
      expect(events[2]?.payload).toMatchObject({
        studentId: id,
        courseName: 'Class B course',
        firstEnrolment: true,
      });
    });

    it('refuses a primary instructor who is not an instructor of the school, writing nothing', async () => {
      const office = await createLogin(tenants, A, ['office']);
      const res = await http
        .post('/v1/students')
        .set(authHeaders(A))
        .send(
          studentBody({ fullName: 'Nobody', primaryInstructorMembershipId: office.membershipId }),
        );
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.details.issues[0].path).toEqual(['primaryInstructorMembershipId']);
      const count = await system.query(
        `select count(*)::int as n from students where full_name = 'Nobody'`,
      );
      expect(count.rows[0].n).toBe(0);
    });

    it('forbids instructors', async () => {
      const res = await http.post('/v1/students').set(ingo.headers).send(studentBody());
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('GET /v1/students/:id', () => {
    it('returns the student with enrolments, instructors, guardians and contacts, and audits the staff read', async () => {
      const { id } = await create(
        studentBody({
          fullName: 'Greta Guarded',
          dateOfBirth: dateYearsAgo(16),
          primaryInstructorMembershipId: ingo.membershipId,
          enrolment: { courseName: 'Class B course', licenceClass: 'B' },
        }),
      );
      const parent = await createUser(tenants, {
        email: `parent.${id.slice(-8)}@example.com`,
        memberships: [{ tenant: A, roles: ['parent'] }],
      });
      await linkGuardianRow(tenants, A, id, parent.userId, null);

      const res = await http.get(`/v1/students/${id}`).set(authHeaders(A));
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({
        id,
        userId: null,
        fullName: 'Greta Guarded',
        phone: null,
        email: null,
        isMinor: true,
        status: 'active',
        enrolments: [{ courseName: 'Class B course', licenceClass: 'B', endedAt: null }],
        instructors: [{ instructorMembershipId: ingo.membershipId, isPrimary: true }],
        guardians: [
          {
            guardianUserId: parent.userId,
            email: parent.email,
            consentAt: null,
            revokedAt: null,
          },
        ],
      });
      expect(res.body.instructors[0].instructorName).toMatch(/^User /);
      expect(await auditRows(id)).toEqual([
        { action: 'student.read', actor_user_id: A.ownerUserId },
      ]);
    });

    it('treats a student whose birthday is today as an adult and one day younger as a minor', async () => {
      const adult = await create(studentBody({ dateOfBirth: dateYearsAgo(18) }));
      const minor = await create(studentBody({ dateOfBirth: dateYearsAgo(18, 1) }));
      const a = await http.get(`/v1/students/${adult.id}`).set(authHeaders(A));
      const m = await http.get(`/v1/students/${minor.id}`).set(authHeaders(A));
      expect(a.body.isMinor).toBe(false);
      expect(m.body.isMinor).toBe(true);
    });

    it('lets an instructor see an assigned student (audited) but not an unassigned one', async () => {
      const assigned = await create();
      const other = await create();
      await assignInstructor(tenants, A, assigned.id, ingo.membershipId);
      const ok = await http.get(`/v1/students/${assigned.id}`).set(ingo.headers);
      expect(ok.status).toBe(StatusCodes.OK);
      expect(await auditRows(assigned.id)).toEqual([
        { action: 'student.read', actor_user_id: ingo.userId },
      ]);
      const hidden = await http.get(`/v1/students/${other.id}`).set(ingo.headers);
      expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
      expect(hidden.text).not.toContain(other.id);
    });

    it('lets an instructor see a student with a lesson in the last 90 days or the future, not older', async () => {
      const recent = await create();
      const future = await create();
      const old = await create();
      const now = Date.now();
      await createLessonRow(tenants, A, {
        studentId: recent.id,
        instructorMembershipId: ina.membershipId,
        start: new Date(now - 89 * DAY_MS),
        status: 'completed',
      });
      await createLessonRow(tenants, A, {
        studentId: future.id,
        instructorMembershipId: ina.membershipId,
        start: new Date(now + 3 * DAY_MS),
        status: 'booked',
      });
      await createLessonRow(tenants, A, {
        studentId: old.id,
        instructorMembershipId: ina.membershipId,
        start: new Date(now - 91 * DAY_MS),
        status: 'completed',
      });
      expect((await http.get(`/v1/students/${recent.id}`).set(ina.headers)).status).toBe(
        StatusCodes.OK,
      );
      expect((await http.get(`/v1/students/${future.id}`).set(ina.headers)).status).toBe(
        StatusCodes.OK,
      );
      expect((await http.get(`/v1/students/${old.id}`).set(ina.headers)).status).toBe(
        StatusCodes.NOT_FOUND,
      );
    });

    it('lets a student see only themselves and a parent only linked students with consent, by role alone', async () => {
      const studentUser = await createLogin(tenants, A, ['student']);
      const self = await createStudent(tenants, A, {
        dateOfBirth: '2000-01-01',
        userId: studentUser.userId,
      });
      const someoneElse = await create();
      expect((await http.get(`/v1/students/${self}`).set(studentUser.headers)).status).toBe(
        StatusCodes.OK,
      );
      expect(await auditRows(self)).toEqual([]);
      expect(
        (await http.get(`/v1/students/${someoneElse.id}`).set(studentUser.headers)).status,
      ).toBe(StatusCodes.NOT_FOUND);

      const parent = await createLogin(tenants, A, ['parent']);
      const consented = await create();
      const pending = await create();
      const revoked = await create();
      await linkGuardianRow(tenants, A, consented.id, parent.userId, new Date());
      await linkGuardianRow(tenants, A, pending.id, parent.userId, null);
      const revokedLink = await linkGuardianRow(tenants, A, revoked.id, parent.userId, new Date());
      await system.query(`update guardian_links set revoked_at = now() where id = $1`, [
        revokedLink,
      ]);
      expect((await http.get(`/v1/students/${consented.id}`).set(parent.headers)).status).toBe(
        StatusCodes.OK,
      );
      expect((await http.get(`/v1/students/${pending.id}`).set(parent.headers)).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      expect((await http.get(`/v1/students/${revoked.id}`).set(parent.headers)).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      const list = await http.get('/v1/students').set(parent.headers);
      expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([consented.id]);
    });

    it('is 404 for a parent without links and for a student of another school', async () => {
      const parent = await createLogin(tenants, A, ['parent']);
      const { id } = await create();
      expect((await http.get(`/v1/students/${id}`).set(parent.headers)).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      const otherSchool = await create(studentBody(), authHeaders(B));
      const studentUser = await createLogin(tenants, A, ['student']);
      expect(
        (await http.get(`/v1/students/${otherSchool.id}`).set(studentUser.headers)).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('GET /v1/students', () => {
    it('lists students with filters, the primary instructor name and placeholders, page by page', async () => {
      const tenantsC = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
      const C = tenantsC.A;
      const teacher = await createLogin(tenantsC, C, ['instructor']);
      const first = await create(
        studentBody({
          fullName: 'Paula Page',
          primaryInstructorMembershipId: teacher.membershipId,
        }),
        authHeaders(C),
      );
      const second = await create(studentBody({ fullName: 'Peter Page' }), authHeaders(C));
      const third = await create(studentBody({ fullName: 'Quentin Other' }), authHeaders(C));
      await http
        .post(`/v1/students/${third.id}/archive`)
        .set(authHeaders(C))
        .send({})
        .expect(StatusCodes.OK);

      const page1 = await http.get('/v1/students?limit=2').set(authHeaders(C));
      expect(page1.status).toBe(StatusCodes.OK);
      expect(page1.body.items.map((s: { id: string }) => s.id)).toEqual([first.id, second.id]);
      expect(page1.body.items[0]).toMatchObject({
        fullName: 'Paula Page',
        licenceClass: 'B',
        status: 'active',
        primaryInstructorName: expect.stringMatching(/^User /),
        balanceMinutes: 0,
        nextLessonAt: null,
        lastLessonAt: null,
        progressPct: 0,
      });
      expect(page1.body.items[1].primaryInstructorName).toBeNull();
      const page2 = await http
        .get(`/v1/students?limit=2&cursor=${page1.body.nextCursor}`)
        .set(authHeaders(C));
      expect(page2.body).toMatchObject({ items: [{ id: third.id }], nextCursor: null });

      const byName = await http.get('/v1/students?q=page').set(authHeaders(C));
      expect(byName.body.items.map((s: { id: string }) => s.id)).toEqual([first.id, second.id]);
      const archived = await http.get('/v1/students?status=archived').set(authHeaders(C));
      expect(archived.body.items.map((s: { id: string }) => s.id)).toEqual([third.id]);
      const byInstructor = await http
        .get(`/v1/students?instructorId=${teacher.membershipId}`)
        .set(authHeaders(C));
      expect(byInstructor.body.items.map((s: { id: string }) => s.id)).toEqual([first.id]);

      const asTeacher = await http.get('/v1/students').set(teacher.headers);
      expect(asTeacher.body.items.map((s: { id: string }) => s.id)).toEqual([first.id]);
      await tenantsC.close();
    });

    it('reads balance, lesson dates and progress from rm_student_list, and keeps names current on PATCH', async () => {
      const { id } = await create(studentBody({ fullName: 'Rita Readmodel' }));
      await system.query(
        `update rm_student_list
            set balance_minutes = 420, progress_pct = 55,
                next_lesson_at = '2026-11-02T08:00:00Z', last_lesson_at = '2026-10-01T08:00:00Z'
          where student_id = $1`,
        [id],
      );
      await http
        .patch(`/v1/students/${id}`)
        .set(authHeaders(A))
        .send({ fullName: 'Rita Renamed', licenceClass: 'A' })
        .expect(StatusCodes.OK);

      const res = await http.get('/v1/students?q=rita').set(authHeaders(A));
      expect(res.body.items).toEqual([
        expect.objectContaining({
          id,
          fullName: 'Rita Renamed',
          licenceClass: 'A',
          balanceMinutes: 420,
          progressPct: 0,
          nextLessonAt: '2026-11-02T08:00:00.000Z',
          lastLessonAt: '2026-10-01T08:00:00.000Z',
        }),
      ]);
      await system.query(`delete from rm_student_list where student_id = $1`, [id]);
      const gone = await http.get('/v1/students?q=rita').set(authHeaders(A));
      expect(gone.body.items).toEqual([]);
    });

    it('does not audit list views', async () => {
      const { id } = await create();
      await http.get('/v1/students').set(authHeaders(A)).expect(StatusCodes.OK);
      expect(await auditRows(id)).toEqual([]);
    });
  });

  describe('PATCH /v1/students/:id', () => {
    it('changes details and bumps the version', async () => {
      const { id } = await create();
      const res = await http
        .patch(`/v1/students/${id}`)
        .set(authHeaders(A))
        .send({ fullName: 'Selin Renamed', testDate: '2026-12-01', area: null });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ id, version: 2 });
      const row = (
        await system.query(`select full_name, test_date::text, area from students where id = $1`, [
          id,
        ])
      ).rows[0];
      expect(row).toEqual({ full_name: 'Selin Renamed', test_date: '2026-12-01', area: null });
    });

    it('is 404 for another school', async () => {
      const { id } = await create();
      const res = await http.patch(`/v1/students/${id}`).set(authHeaders(B)).send({ area: 'X' });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('POST /v1/students/:id/enrolments', () => {
    it('emits StudentEnrolled with firstEnrolment true, then false', async () => {
      const { id } = await create();
      const first = await http
        .post(`/v1/students/${id}/enrolments`)
        .set(authHeaders(A))
        .send({ courseName: 'Class B', licenceClass: 'B', startedAt: '2026-10-01T08:00:00.000Z' });
      expect(first.status, JSON.stringify(first.body)).toBe(StatusCodes.CREATED);
      const second = await http
        .post(`/v1/students/${id}/enrolments`)
        .set(authHeaders(A))
        .send({ courseName: 'Class A course', licenceClass: 'A' });
      expect(second.status).toBe(StatusCodes.CREATED);
      const events = await expectEvents(db, { type: StudentEnrolled, aggregateId: id });
      expect(events.map((e) => e.payload)).toEqual([
        {
          studentId: id,
          enrolmentId: first.body.id,
          courseName: 'Class B',
          licenceClass: 'B',
          firstEnrolment: true,
          startedAt: '2026-10-01T08:00:00.000Z',
        },
        expect.objectContaining({ enrolmentId: second.body.id, firstEnrolment: false }),
      ]);
      expect(events.map((e) => e.aggregateVersion)).toEqual([2, 3]);
    });

    it('cannot enrol an archived student', async () => {
      const { id } = await create();
      await http
        .post(`/v1/students/${id}/archive`)
        .set(authHeaders(A))
        .send({})
        .expect(StatusCodes.OK);
      const res = await http
        .post(`/v1/students/${id}/enrolments`)
        .set(authHeaders(A))
        .send({ courseName: 'Class B', licenceClass: 'B' });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('student_not_active');
    });
  });

  describe('POST /v1/students/:id/archive', () => {
    it('archives, ends enrolments, unassigns instructors and reports completed lessons', async () => {
      const { id } = await create(
        studentBody({
          primaryInstructorMembershipId: ingo.membershipId,
          enrolment: { courseName: 'Class B', licenceClass: 'B' },
        }),
      );
      await createLessonRow(tenants, A, {
        studentId: id,
        instructorMembershipId: ingo.membershipId,
        start: new Date(Date.now() - DAY_MS),
        status: 'completed',
      });
      await createLessonRow(tenants, A, {
        studentId: id,
        instructorMembershipId: ingo.membershipId,
        start: new Date(Date.now() - 2 * DAY_MS),
        status: 'completed',
      });
      const res = await http
        .post(`/v1/students/${id}/archive`)
        .set(authHeaders(A))
        .send({ reason: 'Passed the test' });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ id, version: 5 });

      const state = (
        await system.query(
          `select s.status,
                  (select count(*)::int from enrolments where student_id = s.id and ended_at is null) as open_enrolments,
                  (select count(*)::int from student_instructors where student_id = s.id and unassigned_at is null) as active_assignments
             from students s where s.id = $1`,
          [id],
        )
      ).rows[0];
      expect(state).toEqual({ status: 'archived', open_enrolments: 0, active_assignments: 0 });
      const [unassigned] = await expectEvents(db, { type: InstructorUnassigned, aggregateId: id });
      expect(unassigned?.payload).toMatchObject({
        instructorMembershipId: ingo.membershipId,
        wasPrimary: true,
      });
      const [archived] = await expectEvents(db, { type: StudentArchived, aggregateId: id });
      expect(archived).toMatchObject({
        aggregateVersion: 5,
        payload: { studentId: id, completedLessons: 2 },
      });
      expect((await auditRows(id)).map((row) => row.action)).toEqual(['student.archive']);

      const again = await http.post(`/v1/students/${id}/archive`).set(authHeaders(A)).send({});
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(await expectEvents(db, { type: StudentArchived, aggregateId: id })).toHaveLength(1);
    });
  });

  describe('GET/PUT /v1/students/:id/instructors', () => {
    it('replaces assignments by diff and emits assigned/unassigned events', async () => {
      const { id } = await create(
        studentBody({ primaryInstructorMembershipId: ingo.membershipId }),
      );
      const res = await http
        .put(`/v1/students/${id}/instructors`)
        .set(authHeaders(A))
        .send({
          instructors: [
            { instructorMembershipId: ina.membershipId, isPrimary: true },
            { instructorMembershipId: ingo.membershipId, isPrimary: false },
          ],
        });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(
        res.body.items.map((i: { instructorMembershipId: string; isPrimary: boolean }) => [
          i.instructorMembershipId,
          i.isPrimary,
        ]),
      ).toEqual(
        expect.arrayContaining([
          [ina.membershipId, true],
          [ingo.membershipId, false],
        ]),
      );
      const assigned = await expectEvents(db, { type: InstructorAssigned, aggregateId: id });
      expect(assigned.map((e) => [e.payload.instructorMembershipId, e.payload.isPrimary])).toEqual([
        [ingo.membershipId, true],
        [ingo.membershipId, false],
        [ina.membershipId, true],
      ]);
      expect(assigned[1]?.payload.assignmentId).toBe(assigned[0]?.payload.assignmentId);

      const removed = await http
        .put(`/v1/students/${id}/instructors`)
        .set(authHeaders(A))
        .send({ instructors: [{ instructorMembershipId: ina.membershipId, isPrimary: true }] });
      expect(removed.status).toBe(StatusCodes.OK);
      const unassigned = await expectEvents(db, { type: InstructorUnassigned, aggregateId: id });
      expect(unassigned.map((e) => e.payload.instructorMembershipId)).toEqual([ingo.membershipId]);

      const listed = await http.get(`/v1/students/${id}/instructors`).set(authHeaders(A));
      expect(listed.status).toBe(StatusCodes.OK);
      expect(listed.body.items).toHaveLength(1);
      expect(listed.body.items[0]).toMatchObject({
        instructorMembershipId: ina.membershipId,
        isPrimary: true,
      });
      expect((await http.get(`/v1/students/${id}/instructors`).set(ingo.headers)).status).toBe(
        StatusCodes.NOT_FOUND,
      );
    });

    it('refuses memberships without the instructor role', async () => {
      const { id } = await create();
      const parent = await createLogin(tenants, A, ['parent']);
      const res = await http
        .put(`/v1/students/${id}/instructors`)
        .set(authHeaders(A))
        .send({ instructors: [{ instructorMembershipId: parent.membershipId, isPrimary: true }] });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.details.issues[0].path).toEqual([
        'instructors',
        0,
        'instructorMembershipId',
      ]);
      await expectNoEvent(db, { type: InstructorAssigned, aggregateId: id });
    });
  });

  describe('guardians', () => {
    it('links an existing parent directly, and the parent gives consent', async () => {
      const studentUser = await createUser(tenants, {
        memberships: [{ tenant: A, roles: ['student'] }],
      });
      const studentId = await createStudent(tenants, A, {
        dateOfBirth: dateYearsAgo(15),
        userId: studentUser.userId,
      });
      const parent = await createLogin(tenants, A, ['parent']);
      const link = await http
        .post(`/v1/students/${studentId}/guardians`)
        .set(authHeaders(A))
        .send({ guardianUserId: parent.userId });
      expect(link.status, JSON.stringify(link.body)).toBe(StatusCodes.CREATED);
      expect(link.body).toMatchObject({ version: 1, pending: false });
      const [linked] = await expectEvents(db, { type: GuardianLinked, aggregateId: studentId });
      expect(linked?.payload).toEqual({
        guardianLinkId: link.body.id,
        studentId,
        guardianUserId: parent.userId,
        studentUserId: studentUser.userId,
        consentRequired: true,
      });

      const again = await http
        .post(`/v1/students/${studentId}/guardians`)
        .set(authHeaders(A))
        .send({ guardianUserId: parent.userId });
      expect(again.body.id).toBe(link.body.id);

      const stranger = await createLogin(tenants, A, ['parent']);
      const denied = await http
        .post(`/v1/guardians/${link.body.id}/consent`)
        .set(stranger.headers)
        .send({ consentTextVersion: '2026-09' });
      expect(denied.status).toBe(StatusCodes.NOT_FOUND);

      const consent = await http
        .post(`/v1/guardians/${link.body.id}/consent`)
        .set(parent.headers)
        .send({ consentTextVersion: '2026-09' });
      expect(consent.status, JSON.stringify(consent.body)).toBe(StatusCodes.OK);
      expect(consent.body).toEqual({ id: link.body.id, version: 2 });
      const [given] = await expectEvents(db, {
        type: GuardianConsentGiven,
        aggregateId: studentId,
      });
      expect(given?.payload).toEqual({
        schoolId: A.schoolId,
        studentId,
        guardianLinkId: link.body.id,
        guardianUserId: parent.userId,
        studentUserId: studentUser.userId,
        consentTextVersion: '2026-09',
      });
      const row = (
        await system.query(
          `select consent_at is not null as consented, consent_text_version from guardian_links where id = $1`,
          [link.body.id],
        )
      ).rows[0];
      expect(row).toEqual({ consented: true, consent_text_version: '2026-09' });
    });

    it('refuses to link a user who is not a parent of the school', async () => {
      const { id } = await create();
      const res = await http
        .post(`/v1/students/${id}/guardians`)
        .set(authHeaders(A))
        .send({ guardianUserId: ingo.userId });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      const other = await createUser(tenants, { memberships: [{ tenant: B, roles: ['parent'] }] });
      const foreign = await http
        .post(`/v1/students/${id}/guardians`)
        .set(authHeaders(A))
        .send({ guardianUserId: other.userId });
      expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    });

    it('invites a guardian by contact through identity and reports the link as pending', async () => {
      const { id } = await create();
      const email = `guardian.${id.slice(-8)}@example.com`;
      const res = await http
        .post(`/v1/students/${id}/guardians`)
        .set(authHeaders(A))
        .send({ email });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({ version: 1, pending: true });
      const invitation = (
        await system.query(`select id, roles, student_id, email from invitations where id = $1`, [
          res.body.id,
        ])
      ).rows[0];
      expect(invitation).toEqual({ id: res.body.id, roles: ['parent'], student_id: id, email });
    });
  });
});
