import { randomUUID } from 'node:crypto';
import {
  InstructorUnassigned,
  StudentAnonymized,
  studentExportResponseSchema,
} from '@driveos/shared';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { RecordProgressCommand } from '../../src/modules/training/index.js';
import { createPriceItemRow } from '../billing/support.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createUser, uniqueEmail, uniquePhone } from '../identity/support.js';
import { expectEvents } from '../support/events.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import {
  createLessonRow,
  createLogin,
  createSyllabus,
  linkGuardianRow,
  type Login,
  principalOf,
  studentBody,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const SECRET = 'PRIVATE-NOTE-SECRET-91c2';
const DAY_MS = 86_400_000;

describe('training HTTP: export and anonymize', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let ingo: Login;
  let office: Login;
  let syllabus: string[];
  let priceItem: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A } = tenants);
    http = request(kernel.app.getHttpServer());
    ingo = await createLogin(tenants, A, ['instructor']);
    office = await createLogin(tenants, A, ['office']);
    syllabus = await createSyllabus(tenants, A, ['B01', 'B02']);
    priceItem = await createPriceItemRow(tenants, A, { amountMinor: 60_000 });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  let slot = 0;

  async function fullStudent(extraMembershipTenant?: TestTenant) {
    const user = await createUser(tenants, {
      phone: uniquePhone(),
      email: uniqueEmail(),
      memberships: [
        { tenant: A, roles: ['student'] },
        ...(extraMembershipTenant ? [{ tenant: extraMembershipTenant, roles: ['student'] }] : []),
      ],
    });
    const created = await http
      .post('/v1/students')
      .set(authHeaders(A))
      .send(
        studentBody({
          fullName: 'Edda Export',
          dateOfBirth: '2001-02-03',
          testDate: '2026-12-01',
          area: 'Mitte',
          pickupAddress: 'Invalidenstraße 50',
          pickupLat: 52.53,
          pickupLng: 13.37,
          primaryInstructorMembershipId: ingo.membershipId,
          enrolment: { courseName: 'Class B course', licenceClass: 'B' },
        }),
      );
    expect(created.status, JSON.stringify(created.body)).toBe(StatusCodes.CREATED);
    const studentId = created.body.id as string;
    await system.query(`update students set user_id = $1 where id = $2`, [user.userId, studentId]);
    const parent = await createUser(tenants, {
      phone: uniquePhone(),
      email: uniqueEmail(),
      memberships: [{ tenant: A, roles: ['parent'] }],
    });
    await linkGuardianRow(tenants, A, studentId, parent.userId, new Date());
    slot += 1;
    const lessonId = await createLessonRow(tenants, A, {
      studentId,
      instructorMembershipId: ingo.membershipId,
      start: new Date(Date.now() - 5 * DAY_MS - slot * 2 * 3_600_000),
    });
    await executeAs(
      kernel.app,
      A,
      new RecordProgressCommand(principalOf(A, ingo, ['instructor']), {
        lessonId,
        studentId,
        entries: [{ syllabusItemId: syllabus[0] as string, level: 3, note: 'Good mirrors' }],
      }),
    );
    await http
      .put(`/v1/students/${studentId}/private-notes/${lessonId}`)
      .set(ingo.headers)
      .send({ body: SECRET })
      .expect(StatusCodes.OK);
    await http
      .post(`/v1/students/${studentId}/test-attempts`)
      .set(ingo.headers)
      .send({ kind: 'theory', takenOn: '2026-09-28', result: 'passed', notes: 'Clean run' })
      .expect(StatusCodes.CREATED);
    const cash = await http
      .post('/v1/payments/cash')
      .set(authHeaders(A))
      .set('Idempotency-Key', randomUUID())
      .send({
        studentId,
        priceItemId: priceItem,
        method: 'cash',
        amountMinor: 60_000,
        currency: 'EUR',
      });
    expect(cash.status, JSON.stringify(cash.body)).toBe(StatusCodes.CREATED);
    return { studentId, user, parent, lessonId };
  }

  const auditActions = async (targetId: string) =>
    (
      await system.query<{ action: string }>(
        `select action from audit_log where target_id = $1 order by at`,
        [targetId],
      )
    ).rows.map((row) => row.action);

  const countRows = async (table: string, studentId: string) =>
    (
      await system.query<{ n: number }>(
        `select count(*)::int as n from ${table} where student_id = $1`,
        [studentId],
      )
    ).rows[0]?.n;

  describe('POST /v1/students/:id/export', () => {
    it('returns the JSON bundle and a PDF, without private notes or guardian contacts, audited', async () => {
      const { studentId, user, parent, lessonId } = await fullStudent();

      const res = await http.post(`/v1/students/${studentId}/export`).set(office.headers);

      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      const body = studentExportResponseSchema.parse(res.body);
      expect(body.bundle.student).toMatchObject({
        id: studentId,
        fullName: 'Edda Export',
        phone: user.phone,
        email: user.email,
        dateOfBirth: '2001-02-03',
        enrolments: [expect.objectContaining({ courseName: 'Class B course' })],
      });
      expect(body.bundle.guardians).toEqual([
        {
          fullName: expect.any(String),
          consentAt: expect.any(String),
          consentTextVersion: 'v1',
          revokedAt: null,
        },
      ]);
      expect(body.bundle.progress.entries).toEqual([
        expect.objectContaining({ lessonId, level: 3, note: 'Good mirrors' }),
      ]);
      expect(body.bundle.progress.testAttempts).toEqual([
        expect.objectContaining({ kind: 'theory', result: 'passed', notes: 'Clean run' }),
      ]);
      expect(body.bundle.invoices).toEqual([
        expect.objectContaining({ kind: 'invoice', totalMinor: 60_000, currency: 'EUR' }),
      ]);
      expect(body.bundle.ledger).toEqual([
        expect.objectContaining({ entryType: 'purchase', minutes: 600, balanceAfter: 600 }),
      ]);
      expect(body.bundle.documents).toEqual([]);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(SECRET);
      expect(raw).not.toContain(parent.phone);
      expect(raw).not.toContain(parent.email);
      const pdf = Buffer.from(body.pdfBase64, 'base64').toString('latin1');
      expect(pdf.startsWith('%PDF-1.4')).toBe(true);
      expect(pdf).toContain('Edda Export');
      expect(pdf).not.toContain(SECRET);
      expect(await auditActions(studentId)).toContain('student.export');
    });

    it('is refused to instructors (403) and hides other schools’ students (404)', async () => {
      const { studentId } = await fullStudent();
      expect((await http.post(`/v1/students/${studentId}/export`).set(ingo.headers)).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      expect(
        (await http.post(`/v1/students/${randomUUID()}/export`).set(authHeaders(A))).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('DELETE /v1/students/:id (anonymize)', () => {
    it('clears personal data, revokes links, keeps financial rows and appends StudentAnonymized', async () => {
      const { studentId, user } = await fullStudent();
      const before = {
        invoices: await countRows('invoices', studentId),
        payments: await countRows('payments', studentId),
        ledger: await countRows('ledger_entries', studentId),
        progress: await countRows('progress_entries', studentId),
      };
      expect(before).toEqual({ invoices: 1, payments: 1, ledger: 1, progress: 1 });
      const buyer = await system.query(
        `select buyer_snapshot from invoices where student_id = $1`,
        [studentId],
      );

      const res = await http.delete(`/v1/students/${studentId}`).set(authHeaders(A));

      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ id: studentId, version: expect.any(Number) });
      const student = await system.query(
        `select full_name, user_id, date_of_birth::text as dob, test_date, area, pickup_address,
                pickup_lat, pickup_lng, status, version
           from students where id = $1`,
        [studentId],
      );
      expect(student.rows[0]).toEqual({
        full_name: 'Anonymized student',
        user_id: null,
        dob: '1900-01-01',
        test_date: null,
        area: null,
        pickup_address: null,
        pickup_lat: null,
        pickup_lng: null,
        status: 'anonymized',
        version: res.body.version,
      });
      expect(await countRows('guardian_links', studentId)).toBe(1);
      const links = await system.query(
        `select count(*)::int as n from guardian_links where student_id = $1 and revoked_at is null`,
        [studentId],
      );
      expect(links.rows[0].n).toBe(0);
      const assignments = await system.query(
        `select count(*)::int as n from student_instructors where student_id = $1 and unassigned_at is null`,
        [studentId],
      );
      expect(assignments.rows[0].n).toBe(0);
      expect(await countRows('private_notes', studentId)).toBe(0);
      const progress = await system.query(
        `select level, note from progress_entries where student_id = $1`,
        [studentId],
      );
      expect(progress.rows).toEqual([{ level: 3, note: '' }]);
      const attempts = await system.query(
        `select result, notes from test_attempts where student_id = $1`,
        [studentId],
      );
      expect(attempts.rows).toEqual([{ result: 'passed', notes: '' }]);
      expect({
        invoices: await countRows('invoices', studentId),
        payments: await countRows('payments', studentId),
        ledger: await countRows('ledger_entries', studentId),
        progress: await countRows('progress_entries', studentId),
      }).toEqual(before);
      const buyerAfter = await system.query(
        `select buyer_snapshot from invoices where student_id = $1`,
        [studentId],
      );
      expect(buyerAfter.rows).toEqual(buyer.rows);
      const userRow = await system.query(
        `select full_name, phone, email from users where id = $1`,
        [user.userId],
      );
      expect(userRow.rows[0]).toEqual({ full_name: 'Anonymized user', phone: null, email: null });
      const list = await system.query(
        `select full_name, status from rm_student_list where student_id = $1`,
        [studentId],
      );
      expect(list.rows[0]).toEqual({ full_name: 'Anonymized student', status: 'anonymized' });

      const [event] = await expectEvents(db, { type: StudentAnonymized, aggregateId: studentId });
      expect(event?.payload).toEqual({
        studentId,
        userId: user.userId,
        userAnonymized: true,
        anonymizedAt: expect.any(String),
      });
      expect(
        await expectEvents(db, { type: InstructorUnassigned, aggregateId: studentId }),
      ).toHaveLength(1);
      expect(await auditActions(studentId)).toContain('student.anonymize');
    });

    it('keeps the user when they have another membership', async () => {
      const otherSchool = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
      const { studentId, user } = await fullStudent(otherSchool.A);

      await http.delete(`/v1/students/${studentId}`).set(authHeaders(A)).expect(StatusCodes.OK);

      const userRow = await system.query(`select phone, email from users where id = $1`, [
        user.userId,
      ]);
      expect(userRow.rows[0]).toEqual({ phone: user.phone, email: user.email });
      const [event] = await expectEvents(db, { type: StudentAnonymized, aggregateId: studentId });
      expect(event?.payload).toMatchObject({ userId: user.userId, userAnonymized: false });
      await otherSchool.close();
    });

    it('is idempotent and owner-only', async () => {
      const { studentId } = await fullStudent();
      expect((await http.delete(`/v1/students/${studentId}`).set(office.headers)).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      const first = await http.delete(`/v1/students/${studentId}`).set(authHeaders(A));
      const second = await http.delete(`/v1/students/${studentId}`).set(authHeaders(A));
      expect(second.status).toBe(StatusCodes.OK);
      expect(second.body).toEqual(first.body);
      expect(
        await expectEvents(db, { type: StudentAnonymized, aggregateId: studentId }),
      ).toHaveLength(1);
      expect(
        (await http.patch(`/v1/students/${studentId}`).set(authHeaders(A)).send({ area: 'X' }))
          .status,
      ).toBe(StatusCodes.CONFLICT);
    });
  });
});
