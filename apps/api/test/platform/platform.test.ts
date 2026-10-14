import { randomUUID } from 'node:crypto';
import {
  InvitationCreated,
  SchoolCreated,
  SubscriptionChanged,
  SupportSessionEnded,
  SupportSessionStarted,
} from '@driveos/shared';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { InviteOwnerCommand } from '../../src/modules/identity/index.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended, expectEvents } from '../support/events.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { StatusCodes } from 'http-status-codes';

describe('platform module', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  const adminId = randomUUID();
  let admin: Record<string, string>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    await system.query(
      `insert into users (id, full_name, email, locale) values ($1, 'Petra Platform', $2, 'en')`,
      [adminId, `petra.${adminId}@example.com`],
    );
    await system.query(`insert into platform_admins (user_id) values ($1)`, [adminId]);
    admin = authHeadersFor(null, { userId: adminId, roles: ['platform_admin'] });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const planBody = (code: string) => ({
    code,
    name: `Plan ${code}`,
    baseAmountMinor: 4900,
    studentFeeMinor: 300,
    currency: 'EUR',
    maxInstructorSeats: null,
  });

  async function createPlan(code = `p-${randomUUID().slice(0, 8)}`): Promise<string> {
    const res = await http.post('/v1/platform/plans').set(admin).send(planBody(code));
    expect(res.status).toBe(StatusCodes.CREATED);
    return res.body.id as string;
  }

  const schoolBody = (planId: string, overrides: Record<string, unknown> = {}) => ({
    name: 'Fahrschule Havel',
    legalName: 'Fahrschule Havel UG',
    address: 'Havelchaussee 1, 14193 Berlin',
    countryCode: 'DE',
    timeZone: 'Europe/Berlin',
    currency: 'EUR',
    locale: 'en',
    planId,
    owner: { fullName: 'Hanna Havel', email: `hanna.${randomUUID()}@example.com` },
    ...overrides,
  });

  async function startSession(schoolId: string, extra: Record<string, unknown> = {}) {
    const res = await http
      .post('/v1/platform/support-sessions')
      .set(admin)
      .send({ schoolId, reason: 'Ticket 4711: invoice missing', ...extra });
    expect(res.status).toBe(StatusCodes.CREATED);
    return res.body as { id: string; version: number; supportToken: string; expiresAt: string };
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function auditRows(sessionId: string) {
    const { rows } = await system.query<{
      school_id: string;
      actor_user_id: string;
      action: string;
      target_type: string;
      target_id: string;
    }>(
      `select school_id, actor_user_id, action, target_type, target_id
         from audit_log where support_session_id = $1 order by at, id`,
      [sessionId],
    );
    return rows;
  }

  describe('access', () => {
    it.each([
      ['POST', '/v1/platform/schools'],
      ['GET', '/v1/platform/plans'],
      ['POST', '/v1/platform/plans'],
      ['GET', '/v1/platform/statements'],
      ['POST', '/v1/platform/support-sessions'],
    ])('only a platform admin may call %s %s', async (method, path) => {
      const res = await http[method.toLowerCase() as 'get' | 'post'](path)
        .set(authHeaders(A))
        .send({});
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.error).toMatchObject({
        code: 'forbidden',
        details: { permission: 'platform.manage' },
      });
    });
  });

  describe('plans', () => {
    it('creates, lists and updates plans', async () => {
      const code = `std-${randomUUID().slice(0, 8)}`;
      const id = await createPlan(code);
      const list = await http.get('/v1/platform/plans?limit=200').set(admin).expect(StatusCodes.OK);
      expect(list.body.items).toContainEqual({ id, ...planBody(code), features: [], active: true });

      const patched = await http
        .patch(`/v1/platform/plans/${id}`)
        .set(admin)
        .send({ studentFeeMinor: 350, active: false })
        .expect(StatusCodes.OK);
      expect(patched.body).toEqual({ id, version: 2 });
      const inactive = await http
        .get('/v1/platform/plans?active=false')
        .set(admin)
        .expect(StatusCodes.OK);
      expect(inactive.body.items).toContainEqual(
        expect.objectContaining({ id, studentFeeMinor: 350, active: false }),
      );
      const active = await http
        .get('/v1/platform/plans?active=true')
        .set(admin)
        .expect(StatusCodes.OK);
      expect(active.body.items.map((plan: { id: string }) => plan.id)).not.toContain(id);
    });

    it('keeps plan codes unique', async () => {
      const code = `dup-${randomUUID().slice(0, 8)}`;
      await createPlan(code);
      const res = await http.post('/v1/platform/plans').set(admin).send(planBody(code));
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('plan_code_taken');
    });

    it('needs an ISO 4217 currency', async () => {
      const res = await http
        .post('/v1/platform/plans')
        .set(admin)
        .send({ ...planBody(`cur-${randomUUID().slice(0, 8)}`), currency: 'ABC' });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    it('answers 404 for an unknown plan', async () => {
      const res = await http
        .patch(`/v1/platform/plans/${randomUUID()}`)
        .set(admin)
        .send({ active: false });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('school onboarding', () => {
    it('creates the school, settings, subscription and owner invitation in one go', async () => {
      const planId = await createPlan();
      const body = schoolBody(planId);
      const res = await http
        .post('/v1/platform/schools')
        .set(admin)
        .send(body)
        .expect(StatusCodes.CREATED);
      const { schoolId, invitationId, acceptToken } = res.body as {
        schoolId: string;
        invitationId: string;
        acceptToken: string;
      };
      expect(res.body).toEqual({
        id: schoolId,
        version: 1,
        schoolId,
        invitationId,
        acceptToken: expect.any(String),
      });

      const created = await expectEventAppended(db, { type: SchoolCreated, aggregateId: schoolId });
      expect(created.schoolId).toBe(schoolId);
      expect(created.payload).toMatchObject({ name: body.name, status: 'active', planId });
      const subscription = await expectEventAppended(db, {
        type: SubscriptionChanged,
        schoolId,
      });
      expect(subscription.payload).toMatchObject({
        schoolId,
        planId,
        previousPlanId: null,
        baseAmountMinor: 4900,
        studentFeeMinor: 300,
        currency: 'EUR',
      });
      const invitation = await expectEventAppended(db, {
        type: InvitationCreated,
        aggregateId: invitationId,
      });
      expect(invitation.schoolId).toBe(schoolId);
      expect(invitation.payload).toMatchObject({
        roles: ['owner'],
        email: body.owner.email,
        invitedBy: adminId,
      });

      const { rows } = await system.query(
        `select s.status, st.cancellation_window_hours, sub.plan_id
           from schools s join school_settings st on st.school_id = s.id
           join subscriptions sub on sub.school_id = s.id where s.id = $1`,
        [schoolId],
      );
      expect(rows).toEqual([{ status: 'active', cancellation_window_hours: 24, plan_id: planId }]);

      const accepted = await http
        .post(`/v1/invitations/${acceptToken}/accept`)
        .send({ fullName: body.owner.fullName })
        .expect(StatusCodes.OK);
      expect(accepted.body.status).toBe('active');
      const owner = authHeadersFor(
        { schoolId, ownerUserId: accepted.body.userId },
        { roles: ['owner'], membershipId: accepted.body.membershipId },
      );
      const school = await http.get('/v1/school').set(owner).expect(StatusCodes.OK);
      expect(school.body).toMatchObject({ id: schoolId, name: body.name });
      const staff = await http.get('/v1/staff').set(owner).expect(StatusCodes.OK);
      expect(staff.body.items).toEqual([
        expect.objectContaining({ userId: accepted.body.userId, roles: ['owner'] }),
      ]);
    });

    it('can leave the school in onboarding', async () => {
      const planId = await createPlan();
      const res = await http
        .post('/v1/platform/schools')
        .set(admin)
        .send(schoolBody(planId, { status: 'onboarding' }))
        .expect(StatusCodes.CREATED);
      const created = await expectEventAppended(db, {
        type: SchoolCreated,
        aggregateId: res.body.schoolId,
      });
      expect(created.payload.status).toBe('onboarding');
    });

    it.each([
      [{ timeZone: 'Mars/Olympus' }, 'timeZone'],
      [{ currency: 'ABC' }, 'currency'],
    ])('rejects %j and creates nothing', async (overrides, field) => {
      const name = `Invalid ${randomUUID()}`;
      const planId = await createPlan();
      const res = await http
        .post('/v1/platform/schools')
        .set(admin)
        .send(schoolBody(planId, { ...overrides, name }))
        .expect(StatusCodes.BAD_REQUEST);
      expect(res.body.error.details.issues[0].path).toEqual([field]);
      const { rows } = await system.query(`select 1 from schools where name = $1`, [name]);
      expect(rows).toEqual([]);
    });

    it('needs an active plan', async () => {
      await http
        .post('/v1/platform/schools')
        .set(admin)
        .send(schoolBody(randomUUID()))
        .expect(StatusCodes.NOT_FOUND);
      const planId = await createPlan();
      await http.patch(`/v1/platform/plans/${planId}`).set(admin).send({ active: false });
      const res = await http.post('/v1/platform/schools').set(admin).send(schoolBody(planId));
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('plan_inactive');
    });

    it('never lets a school user invite an owner', async () => {
      const ownerOfA = {
        userId: A.ownerUserId,
        schoolId: A.schoolId,
        membershipId: A.ownerMembershipId,
        roles: ['owner'],
        tokenType: 'access' as const,
        sessionId: null,
      };
      await expect(
        executeAs(
          kernel.app,
          A,
          new InviteOwnerCommand(ownerOfA, { email: 'second.owner@example.com' }),
        ),
      ).rejects.toMatchObject({ status: StatusCodes.FORBIDDEN });
    });
  });

  describe('support sessions', () => {
    it('gives a read-only token whose every request is audited with the session id', async () => {
      const session = await startSession(A.schoolId, { durationMinutes: 30 });
      const expiresIn = Date.parse(session.expiresAt) - Date.now();
      expect(expiresIn).toBeGreaterThan(29 * 60_000);
      expect(expiresIn).toBeLessThanOrEqual(30 * 60_000);
      const started = await expectEventAppended(db, {
        type: SupportSessionStarted,
        aggregateId: session.id,
      });
      expect(started.schoolId).toBe(A.schoolId);
      expect(started.payload).toMatchObject({ platformAdminUserId: adminId, schoolId: A.schoolId });

      const school = await http
        .get('/v1/school')
        .set(bearer(session.supportToken))
        .expect(StatusCodes.OK);
      expect(school.body.id).toBe(A.schoolId);
      await http.get('/v1/vehicles').set(bearer(session.supportToken)).expect(StatusCodes.OK);
      const write = await http
        .patch('/v1/school')
        .set(bearer(session.supportToken))
        .send({ name: 'Support was here' });
      expect(write.status).toBe(StatusCodes.FORBIDDEN);
      expect(write.body.error.details).toEqual({ reason: 'support_read_only' });

      expect(await auditRows(session.id)).toEqual([
        {
          school_id: A.schoolId,
          actor_user_id: adminId,
          action: 'support_session.started',
          target_type: 'support_session',
          target_id: session.id,
        },
        {
          school_id: A.schoolId,
          actor_user_id: adminId,
          action: 'GET /v1/school',
          target_type: 'route',
          target_id: A.schoolId,
        },
        {
          school_id: A.schoolId,
          actor_user_id: adminId,
          action: 'GET /v1/vehicles',
          target_type: 'route',
          target_id: A.schoolId,
        },
      ]);

      const log = await http.get('/v1/audit-log').set(authHeaders(A)).expect(StatusCodes.OK);
      expect(
        log.body.items.filter(
          (e: { supportSessionId: string | null }) => e.supportSessionId === session.id,
        ),
      ).toHaveLength(3);
      const other = await http.get('/v1/audit-log').set(authHeaders(B)).expect(StatusCodes.OK);
      expect(JSON.stringify(other.body)).not.toContain(session.id);
    });

    it('stops the token as soon as the session ends', async () => {
      const session = await startSession(A.schoolId);
      await http.get('/v1/school').set(bearer(session.supportToken)).expect(StatusCodes.OK);
      const ended = await http
        .post(`/v1/platform/support-sessions/${session.id}/end`)
        .set(admin)
        .expect(StatusCodes.OK);
      expect(ended.body).toEqual({ id: session.id, version: 2 });
      const event = await expectEventAppended(db, {
        type: SupportSessionEnded,
        aggregateId: session.id,
      });
      expect(event.payload).toMatchObject({ endedBy: 'admin', schoolId: A.schoolId });
      const res = await http
        .get('/v1/school')
        .set(bearer(session.supportToken))
        .expect(StatusCodes.UNAUTHORIZED);
      expect(res.body.error.code).toBe('support_session_ended');
      await http
        .post(`/v1/platform/support-sessions/${session.id}/end`)
        .set(admin)
        .expect(StatusCodes.CONFLICT);
      expect((await auditRows(session.id)).map((row) => row.action)).toEqual([
        'support_session.started',
        'GET /v1/school',
        'support_session.ended',
      ]);
    });

    it('stops the token after the session expired', async () => {
      const session = await startSession(B.schoolId);
      await system.query(
        `update support_sessions set expires_at = now() - interval '1 second' where id = $1`,
        [session.id],
      );
      const res = await http
        .get('/v1/vehicles')
        .set(bearer(session.supportToken))
        .expect(StatusCodes.UNAUTHORIZED);
      expect(res.body.error.code).toBe('support_session_ended');
    });

    it('answers 404 for an unknown school', async () => {
      await http
        .post('/v1/platform/support-sessions')
        .set(admin)
        .send({ schoolId: randomUUID(), reason: 'nobody' })
        .expect(StatusCodes.NOT_FOUND);
    });

    it('caps a session at 60 minutes', async () => {
      const res = await http
        .post('/v1/platform/support-sessions')
        .set(admin)
        .send({ schoolId: A.schoolId, reason: 'long', durationMinutes: 61 });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      const session = await startSession(A.schoolId);
      expect(Date.parse(session.expiresAt) - Date.now()).toBeLessThanOrEqual(60 * 60_000);
      const events = await expectEvents(db, {
        type: SupportSessionStarted,
        aggregateId: session.id,
      });
      expect(events).toHaveLength(1);
    });
  });

  describe('audit log', () => {
    it('is for owners only', async () => {
      await http
        .get('/v1/audit-log')
        .set(authHeadersFor(A, { roles: ['office'] }))
        .expect(StatusCodes.FORBIDDEN);
    });
  });

  describe('platform statements', () => {
    const usedMonths = new Map<string, number>();

    async function statement(tenant: TestTenant, status = 'issued'): Promise<string> {
      const used = usedMonths.get(tenant.schoolId) ?? 0;
      usedMonths.set(tenant.schoolId, used + 1);
      const month = new Date(Date.UTC(2026, 8 - used, 1)).toISOString().slice(0, 10);
      const { rows } = await system.query<{ id: string }>(
        `insert into platform_statements (id, school_id, month, total_minor, currency, status, issued_at)
         values ($1, $2, $3, 4900, 'EUR', $4, now()) returning id`,
        [randomUUID(), tenant.schoolId, month, status],
      );
      return rows[0]?.id ?? '';
    }

    it('lists the statements of every school with only the listed fields', async () => {
      const inA = await statement(A);
      const inB = await statement(B);
      const res = await http
        .get('/v1/platform/statements?status=issued')
        .set(admin)
        .expect(StatusCodes.OK);
      const ids = res.body.items.map((item: { id: string }) => item.id);
      expect(ids).toEqual(expect.arrayContaining([inA, inB]));
      const item = res.body.items.find((entry: { id: string }) => entry.id === inA);
      expect(Object.keys(item).sort()).toEqual(
        [
          'currency',
          'id',
          'issuedAt',
          'markedPaidByUserId',
          'month',
          'paidAt',
          'paidMethod',
          'paidReference',
          'schoolId',
          'schoolName',
          'status',
          'totalMinor',
        ].sort(),
      );
      expect(item).toMatchObject({ schoolId: A.schoolId, month: '2026-09', totalMinor: 4900 });
      const onlyB = await http
        .get(`/v1/platform/statements?schoolId=${B.schoolId}`)
        .set(admin)
        .expect(StatusCodes.OK);
      expect(onlyB.body.items.every((s: { schoolId: string }) => s.schoolId === B.schoolId)).toBe(
        true,
      );
    });

    it('marks a statement paid in full and audits it', async () => {
      const id = await statement(A);
      const paidAt = '2026-10-05T09:00:00.000Z';
      const noReference = await http
        .post(`/v1/platform/statements/${id}/mark-paid`)
        .set(admin)
        .send({ method: 'bank_transfer', paidAt });
      expect(noReference.status).toBe(StatusCodes.BAD_REQUEST);

      const res = await http
        .post(`/v1/platform/statements/${id}/mark-paid`)
        .set(admin)
        .send({ method: 'cash', paidAt })
        .expect(StatusCodes.OK);
      expect(res.body).toEqual({ id, version: 2 });
      const { rows } = await system.query(
        `select status, paid_at, paid_method, paid_reference, marked_paid_by_user_id
           from platform_statements where id = $1`,
        [id],
      );
      expect(rows).toEqual([
        {
          status: 'paid',
          paid_at: new Date(paidAt),
          paid_method: 'cash',
          paid_reference: null,
          marked_paid_by_user_id: adminId,
        },
      ]);
      const audit = await system.query(
        `select school_id, actor_user_id, action, target_type from audit_log where target_id = $1`,
        [id],
      );
      expect(audit.rows).toEqual([
        {
          school_id: A.schoolId,
          actor_user_id: adminId,
          action: 'platform_statement.marked_paid',
          target_type: 'platform_statement',
        },
      ]);
      const again = await http
        .post(`/v1/platform/statements/${id}/mark-paid`)
        .set(admin)
        .send({ method: 'bank_transfer', paidAt, reference: 'TX-9' });
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(again.body.error.code).toBe('statement_already_paid');
    });

    it('takes a bank transfer with its reference', async () => {
      const id = await statement(B);
      await http
        .post(`/v1/platform/statements/${id}/mark-paid`)
        .set(admin)
        .send({ method: 'bank_transfer', paidAt: '2026-10-06T09:00:00.000Z', reference: 'TX-42' })
        .expect(StatusCodes.OK);
      const { rows } = await system.query(
        `select paid_method, paid_reference from platform_statements where id = $1`,
        [id],
      );
      expect(rows).toEqual([{ paid_method: 'bank_transfer', paid_reference: 'TX-42' }]);
    });

    it('answers 404 for an unknown statement', async () => {
      await http
        .post(`/v1/platform/statements/${randomUUID()}/mark-paid`)
        .set(admin)
        .send({ method: 'cash', paidAt: '2026-10-06T09:00:00.000Z' })
        .expect(StatusCodes.NOT_FOUND);
    });
  });
});
