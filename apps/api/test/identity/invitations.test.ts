import { createHmac } from 'node:crypto';
import {
  InvitationCreated,
  MembershipCreated,
  MembershipPermissionsChanged,
  MembershipRolesChanged,
} from '@driveos/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessTokenService } from '../../src/kernel/auth/access-token.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended, expectNoEvent } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import {
  birthDateYearsAgo,
  createBranch,
  createStudent,
  createUser,
  uniqueEmail,
  uniquePhone,
  waitForCode,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

const PEPPER = 'dev-only-code-pepper-change-me-in-production-000';

describe('invitations', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db, [], { env: { AUTH_CODES_PER_IP: '1000' } });
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    A = tenants.A;
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const invite = (body: Record<string, unknown>, headers = authHeaders(A)) =>
    http.post('/v1/invitations').set(headers).send(body);

  const accept = (token: string, body: Record<string, unknown> = {}) =>
    http.post(`/v1/invitations/${token}/accept`).send(body);

  async function invited(body: Record<string, unknown>): Promise<{ id: string; token: string }> {
    const res = await invite(body).expect(StatusCodes.CREATED);
    return { id: res.body.id as string, token: res.body.acceptToken as string };
  }

  const membershipOf = async (schoolId: string, userId: string) =>
    (
      await system.query<{ id: string; roles: string[]; status: string; version: number }>(
        `select id, roles, status, version from memberships where school_id = $1 and user_id = $2`,
        [schoolId, userId],
      )
    ).rows[0];

  describe('POST /v1/invitations', () => {
    it('stores a hashed token valid for 7 days and appends InvitationCreated', async () => {
      const email = uniqueEmail();
      const res = await invite({ roles: ['instructor'], email: email.toUpperCase() }).expect(
        StatusCodes.CREATED,
      );

      expect(res.body).toEqual({
        id: expect.any(String),
        version: 1,
        acceptToken: expect.any(String),
      });
      const token = res.body.acceptToken as string;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const { rows } = await system.query(
        `select school_id, roles, email, phone, token_hash, invited_by,
                round(extract(epoch from expires_at - created_at))::int as ttl
           from invitations where id = $1`,
        [res.body.id],
      );
      expect(rows[0]).toEqual({
        school_id: A.schoolId,
        roles: ['instructor'],
        email,
        phone: null,
        token_hash: createHmac('sha256', PEPPER).update(token).digest('hex'),
        invited_by: A.ownerUserId,
        ttl: 7 * 24 * 3600,
      });
      const event = await expectEventAppended(db, {
        type: InvitationCreated,
        aggregateId: res.body.id,
      });
      expect(event).toMatchObject({
        aggregateType: 'invitation',
        aggregateVersion: 1,
        schoolId: A.schoolId,
      });
      expect(event.payload).toMatchObject({
        email,
        phone: null,
        acceptToken: token,
        roles: ['instructor'],
      });
    });

    it('normalises the phone number', async () => {
      const res = await invite({ roles: ['office'], phone: '0049 155 1234 5678' }).expect(
        StatusCodes.CREATED,
      );
      const { rows } = await system.query(`select phone from invitations where id = $1`, [
        res.body.id,
      ]);
      expect(rows[0]?.phone).toBe('+4915512345678');
    });

    it('rejects an invalid contact, the owner role and a missing studentId', async () => {
      for (const body of [
        { roles: ['instructor'], email: 'not-an-email' },
        { roles: ['instructor'], phone: '12' },
        { roles: ['owner'], email: uniqueEmail() },
        { roles: ['student'], email: uniqueEmail() },
      ]) {
        const res = await invite(body);
        expect(res.status, JSON.stringify(body)).toBe(StatusCodes.BAD_REQUEST);
        expect(res.body.error.code).toBe('validation_error');
      }
    });

    it('requires the student to exist in the school', async () => {
      const studentId = await createStudent(tenants, tenants.B, { dateOfBirth: '2000-01-01' });
      const res = await invite({ roles: ['student'], email: uniqueEmail(), studentId });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      const branchId = await createBranch(tenants, tenants.B);
      const branchRes = await invite({
        roles: ['office'],
        email: uniqueEmail(),
        branchIds: [branchId],
      });
      expect(branchRes.status).toBe(StatusCodes.NOT_FOUND);
    });

    it('is allowed to office and denied to instructors, students and parents', async () => {
      const office = authHeadersFor(A, { roles: ['office'] });
      await invite(
        {
          roles: ['student'],
          email: uniqueEmail(),
          studentId: await createStudent(tenants, A, { dateOfBirth: '2000-01-01' }),
        },
        office,
      ).expect(StatusCodes.CREATED);
      for (const role of ['instructor', 'student', 'parent']) {
        const res = await invite(
          { roles: ['office'], email: uniqueEmail() },
          authHeadersFor(A, { roles: [role] }),
        );
        expect(res.status).toBe(StatusCodes.FORBIDDEN);
        expect(res.body.error).toMatchObject({
          code: 'forbidden',
          details: { permission: 'invitations.manage' },
        });
      }
    });
  });

  describe('GET /v1/invitations', () => {
    it("lists the school's open invitations, newest first, with a cursor", async () => {
      const first = await invited({ roles: ['instructor'], email: uniqueEmail() });
      const second = await invited({ roles: ['office'], email: uniqueEmail() });
      const used = await invited({ roles: ['office'], email: uniqueEmail() });
      await accept(used.token, { fullName: 'Used Invite' }).expect(StatusCodes.OK);
      const expired = await invited({ roles: ['office'], email: uniqueEmail() });
      await system.query(
        `update invitations set expires_at = now() - interval '1 second' where id = $1`,
        [expired.id],
      );

      const page1 = await http
        .get('/v1/invitations?limit=1')
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(page1.body.items.map((i: { id: string }) => i.id)).toEqual([second.id]);
      expect(page1.body.nextCursor).toBe(second.id);
      expect(page1.body.items[0]).toEqual({
        id: second.id,
        roles: ['office'],
        phone: null,
        email: expect.any(String),
        studentId: null,
        branchIds: [],
        invitedBy: A.ownerUserId,
        expiresAt: expect.any(String),
        createdAt: expect.any(String),
      });
      const page2 = await http
        .get(`/v1/invitations?limit=1&cursor=${page1.body.nextCursor as string}`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(page2.body.items.map((i: { id: string }) => i.id)).toEqual([first.id]);
      const all = await http
        .get('/v1/invitations?limit=100')
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      const ids = all.body.items.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(used.id);
      expect(ids).not.toContain(expired.id);
      expect(all.body.nextCursor).toBeNull();
    });

    it('filters by studentId and by role, keeping the cursor', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: birthDateYearsAgo(15) });
      const otherStudentId = await createStudent(tenants, A, {
        dateOfBirth: birthDateYearsAgo(15),
      });
      const parent = await invited({ roles: ['parent'], email: uniqueEmail(), studentId });
      const student = await invited({ roles: ['student'], email: uniqueEmail(), studentId });
      const other = await invited({
        roles: ['parent'],
        email: uniqueEmail(),
        studentId: otherStudentId,
      });
      const staff = await invited({ roles: ['instructor'], email: uniqueEmail() });

      const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((i) => i.id);
      const byStudent = await http
        .get(`/v1/invitations?studentId=${studentId}&limit=1`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(ids(byStudent)).toEqual([student.id]);
      expect(byStudent.body.nextCursor).toBe(student.id);
      const byStudentNext = await http
        .get(`/v1/invitations?studentId=${studentId}&limit=1&cursor=${student.id}`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(ids(byStudentNext)).toEqual([parent.id]);
      expect(byStudentNext.body.nextCursor).toBeNull();

      const parents = await http
        .get(`/v1/invitations?role=parent&limit=100`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(ids(parents)).toEqual(expect.arrayContaining([parent.id, other.id]));
      expect(ids(parents)).not.toContain(student.id);
      expect(ids(parents)).not.toContain(staff.id);

      const both = await http
        .get(`/v1/invitations?studentId=${studentId}&role=parent`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(both.body).toEqual({
        items: [expect.objectContaining({ id: parent.id })],
        nextCursor: null,
      });

      await http
        .get('/v1/invitations?role=pilot')
        .set(authHeaders(A))
        .expect(StatusCodes.BAD_REQUEST);
      await http
        .get('/v1/invitations?studentId=nope')
        .set(authHeaders(A))
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /v1/invitations/{token}/accept', () => {
    it('creates the user and an active membership, then the user can log in', async () => {
      const email = uniqueEmail();
      const branchId = await createBranch(tenants, A);
      const { id, token } = await invited({ roles: ['instructor'], email, branchIds: [branchId] });

      const res = await accept(token, { fullName: 'Ina Instructor', locale: 'en' }).expect(
        StatusCodes.OK,
      );

      expect(res.body).toEqual({
        membershipId: expect.any(String),
        userId: expect.any(String),
        status: 'active',
        studentId: null,
      });
      const { rows: users } = await system.query(
        `select full_name, email, phone, locale from users where id = $1`,
        [res.body.userId],
      );
      expect(users[0]).toEqual({ full_name: 'Ina Instructor', email, phone: null, locale: 'en' });
      expect(await membershipOf(A.schoolId, res.body.userId)).toEqual({
        id: res.body.membershipId,
        roles: ['instructor'],
        status: 'active',
        version: 1,
      });
      const { rows: branches } = await system.query(
        `select branch_id from membership_branches where membership_id = $1`,
        [res.body.membershipId],
      );
      expect(branches).toEqual([{ branch_id: branchId }]);
      const { rows: inv } = await system.query(
        `select accepted_at from invitations where id = $1`,
        [id],
      );
      expect(inv[0]?.accepted_at).toBeInstanceOf(Date);
      const event = await expectEventAppended(db, {
        type: MembershipCreated,
        aggregateId: res.body.membershipId,
      });
      expect(event).toMatchObject({
        aggregateType: 'membership',
        aggregateVersion: 1,
        schoolId: A.schoolId,
      });
      expect(event.payload).toEqual({
        schoolId: A.schoolId,
        membershipId: res.body.membershipId,
        userId: res.body.userId,
        roles: ['instructor'],
        status: 'active',
        studentId: null,
      });

      await http.post('/v1/auth/code').send({ contact: email }).expect(StatusCodes.ACCEPTED);
      const code = await waitForCode(kernel, email);
      const session = await http
        .post('/v1/auth/verify')
        .send({ contact: email, code, client: 'web' })
        .expect(StatusCodes.OK);
      const me = await http
        .get('/v1/me')
        .set({ Authorization: `Bearer ${session.body.accessToken as string}` })
        .expect(StatusCodes.OK);
      expect(me.body.active).toEqual({
        membershipId: res.body.membershipId,
        schoolId: A.schoolId,
        roles: ['instructor'],
        grants: expect.arrayContaining(['sync.use']),
        studentId: null,
        features: [],
      });
    });

    it('requires a full name to create a new user', async () => {
      const { token } = await invited({ roles: ['office'], email: uniqueEmail() });
      const res = await accept(token);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
      await accept(token, { fullName: 'Now Named' }).expect(StatusCodes.OK);
    });

    it('answers 404 for an unknown token, 409 when used and 410 when expired', async () => {
      expect((await accept('x'.repeat(43), { fullName: 'X' })).status).toBe(StatusCodes.NOT_FOUND);
      const used = await invited({ roles: ['office'], email: uniqueEmail() });
      await accept(used.token, { fullName: 'Once' }).expect(StatusCodes.OK);
      const again = await accept(used.token, { fullName: 'Twice' });
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(again.body.error.code).toBe('invitation_used');
      const expired = await invited({ roles: ['office'], email: uniqueEmail() });
      await system.query(
        `update invitations set expires_at = now() - interval '1 second' where id = $1`,
        [expired.id],
      );
      const late = await accept(expired.token, { fullName: 'Late' });
      expect(late.status).toBe(StatusCodes.GONE);
      expect(late.body.error.code).toBe('invitation_expired');
    });

    it('attaches to the user who already owns the contact (D4), in a new school', async () => {
      const phone = uniquePhone();
      const existing = await createUser(tenants, {
        phone,
        memberships: [{ tenant: tenants.B, roles: ['instructor'] }],
      });
      const { token } = await invited({ roles: ['instructor'], phone });

      const res = await accept(token).expect(StatusCodes.OK);

      expect(res.body.userId).toBe(existing.userId);
      expect(await membershipOf(A.schoolId, existing.userId)).toMatchObject({
        roles: ['instructor'],
        status: 'active',
      });
      const { rows } = await system.query(`select count(*)::int as n from users where phone = $1`, [
        phone,
      ]);
      expect(rows[0]?.n).toBe(1);
    });

    it('merges the invited roles into an existing membership', async () => {
      const email = uniqueEmail();
      const existing = await createUser(tenants, {
        email,
        memberships: [{ tenant: A, roles: ['instructor'] }],
      });
      const { token } = await invited({ roles: ['office'], email });

      const res = await accept(token).expect(StatusCodes.OK);

      expect(res.body).toMatchObject({
        membershipId: existing.membershipIds[0],
        userId: existing.userId,
        status: 'active',
      });
      expect(await membershipOf(A.schoolId, existing.userId)).toMatchObject({
        roles: ['office', 'instructor'],
        version: 3,
      });
      const changed = await expectEventAppended(db, {
        type: MembershipRolesChanged,
        aggregateId: res.body.membershipId,
      });
      expect(changed.aggregateVersion).toBe(2);
      expect(changed.payload).toMatchObject({
        roles: ['office', 'instructor'],
        previousRoles: ['instructor'],
      });
      const permissions = await expectEventAppended(db, {
        type: MembershipPermissionsChanged,
        aggregateId: res.body.membershipId,
      });
      expect(permissions.aggregateVersion).toBe(3);
      await expectNoEvent(db, { type: MembershipCreated, aggregateId: res.body.membershipId });
    });

    it('refuses to merge into a disabled membership', async () => {
      const email = uniqueEmail();
      await createUser(tenants, {
        email,
        memberships: [{ tenant: A, roles: ['instructor'], status: 'disabled' }],
      });
      const { token } = await invited({ roles: ['office'], email });
      const res = await accept(token);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('membership_disabled');
    });

    it("starts a minor student's membership as pending_consent", async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: birthDateYearsAgo(18, 1) });
      const { token } = await invited({ roles: ['student'], email: uniqueEmail(), studentId });

      const res = await accept(token, { fullName: 'Mia Minor' }).expect(StatusCodes.OK);

      expect(res.body).toMatchObject({ status: 'pending_consent', studentId });
      expect(await membershipOf(A.schoolId, res.body.userId)).toMatchObject({
        roles: ['student'],
        status: 'pending_consent',
      });
      const event = await expectEventAppended(db, {
        type: MembershipCreated,
        aggregateId: res.body.membershipId,
      });
      expect(event.payload).toMatchObject({ status: 'pending_consent', studentId });
    });

    it('starts a minor student as active when a guardian already gave consent', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: birthDateYearsAgo(15) });
      const guardian = await createUser(tenants, {
        memberships: [{ tenant: A, roles: ['parent'] }],
      });
      await tenants.asSchool(A, (tx) =>
        tx.execute(
          sql`insert into guardian_links (id, school_id, student_id, guardian_user_id, consent_at, consent_text_version)
              values (gen_random_uuid(), ${A.schoolId}, ${studentId}, ${guardian.userId}, now(), 'v1')`,
        ),
      );
      const { token } = await invited({ roles: ['student'], email: uniqueEmail(), studentId });
      const res = await accept(token, { fullName: 'Mona Minor' }).expect(StatusCodes.OK);
      expect(res.body.status).toBe('active');
    });

    it('uses the school age of majority', async () => {
      await tenants.asSchool(A, (tx) =>
        tx.execute(sql`update school_settings set age_of_majority = 16`),
      );
      try {
        const studentId = await createStudent(tenants, A, { dateOfBirth: birthDateYearsAgo(17) });
        const { token } = await invited({ roles: ['student'], email: uniqueEmail(), studentId });
        const res = await accept(token, { fullName: 'Sam Seventeen' }).expect(StatusCodes.OK);
        expect(res.body.status).toBe('active');
      } finally {
        await tenants.asSchool(A, (tx) =>
          tx.execute(sql`update school_settings set age_of_majority = 18`),
        );
      }
    });

    it('activates an adult student and a parent immediately', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: birthDateYearsAgo(18) });
      const student = await invited({ roles: ['student'], email: uniqueEmail(), studentId });
      expect(
        (await accept(student.token, { fullName: 'Ada Adult' }).expect(StatusCodes.OK)).body.status,
      ).toBe('active');
      const minorId = await createStudent(tenants, A, { dateOfBirth: birthDateYearsAgo(10) });
      const parent = await invited({ roles: ['parent'], email: uniqueEmail(), studentId: minorId });
      const res = await accept(parent.token, { fullName: 'Pat Parent' }).expect(StatusCodes.OK);
      expect(res.body).toMatchObject({ status: 'active', studentId: minorId });
    });

    it('lets only one of two parallel accepts succeed', async () => {
      const { token } = await invited({ roles: ['office'], email: uniqueEmail() });
      const results = await Promise.all([
        accept(token, { fullName: 'One' }),
        accept(token, { fullName: 'Two' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([StatusCodes.OK, StatusCodes.CONFLICT]);
      const loser = results.find((r) => r.status === StatusCodes.CONFLICT);
      expect(loser?.body.error.code).toBe('invitation_used');
    });
  });

  describe('NODE_ENV=production', () => {
    it('never returns the accept token', async () => {
      const prod = await createKernelTestApp(db, [], { env: { NODE_ENV: 'production' } });
      try {
        const { token } = await prod.app.get(AccessTokenService).sign({
          userId: A.ownerUserId,
          membershipId: A.ownerMembershipId,
          schoolId: A.schoolId,
          roles: ['owner'],
        });
        const res = await request(prod.app.getHttpServer())
          .post('/v1/invitations')
          .set({ Authorization: `Bearer ${token}` })
          .send({ roles: ['instructor'], email: uniqueEmail() })
          .expect(StatusCodes.CREATED);
        expect(res.body).toEqual({ id: expect.any(String), version: 1 });
      } finally {
        await prod.close();
      }
    });
  });
});
