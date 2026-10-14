import { createHash, randomUUID } from 'node:crypto';
import { LeadCaptured, LeadConverted, LeadStatusChanged } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { plans, subscriptions } from '../../src/modules/platform/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { uniqueEmail, uniquePhone } from '../identity/support.js';
import { expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createLogin, type Login } from './support.js';

interface LeadRow {
  id: string;
  school_id: string;
  status: string;
  source: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  note: string | null;
  consent_text_version: string;
  consented_at: Date;
  request_ip_hash: string | null;
  student_id: string | null;
  converted_at: Date | null;
  lost_at: Date | null;
  lost_reason: string | null;
  version: number;
}

describe('training HTTP: leads', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let office: Login;
  let ingo: Login;
  const slugA = `leads-a-${randomUUID().slice(0, 8)}`;
  const slugB = `leads-b-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());

    const planId = newId();
    await tenants.asSystem((tx) =>
      tx.insert(plans).values({
        id: planId,
        code: 'with-page',
        name: 'With page',
        baseAmountMinor: 4900,
        studentFeeMinor: 300,
        currency: 'EUR',
        active: true,
        features: ['enrolment_page'],
      }),
    );
    await tenants.asSchool(A, (tx) =>
      tx.insert(subscriptions).values({
        id: newId(),
        schoolId: A.schoolId,
        planId,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        endedAt: null,
      }),
    );
    const publish = await http
      .put('/v1/school/public-profile')
      .set(authHeaders(A))
      .send({ slug: slugA, published: true });
    expect(publish.status, JSON.stringify(publish.body)).toBe(StatusCodes.OK);

    office = await createLogin(tenants, A, ['office']);
    ingo = await createLogin(tenants, A, ['instructor']);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const leadBody = (overrides: Record<string, unknown> = {}) => ({
    fullName: 'Lena Lead',
    phone: uniquePhone(),
    licenceClass: 'B',
    message: 'Can I start in November?',
    isMinor: false,
    consentTextVersion: 'lead-consent.v1',
    website: '',
    ...overrides,
  });

  const capture = (body: Record<string, unknown>, slug = slugA, ip = '203.0.113.10') =>
    http.post(`/v1/public/schools/${slug}/leads`).set('X-Forwarded-For', ip).send(body);

  async function captured(body: Record<string, unknown>): Promise<string> {
    const res = await capture(body);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    return res.body.id as string;
  }

  const leadRow = async (id: string) =>
    (await system.query<LeadRow>(`select * from leads where id = $1`, [id])).rows[0];

  describe('POST /v1/public/schools/:slug/leads', () => {
    it('captures a lead from the public page and tells the office', async () => {
      const phone = uniquePhone();
      const res = await capture(
        leadBody({ fullName: '  Lena Lead ', phone, email: 'Lena.Lead@Example.COM' }),
        slugA,
        '203.0.113.77',
      );

      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({ id: expect.any(String) });
      const id = res.body.id as string;
      const row = await leadRow(id);
      expect(row).toMatchObject({
        school_id: A.schoolId,
        status: 'new',
        source: 'page',
        full_name: 'Lena Lead',
        phone,
        email: 'lena.lead@example.com',
        message: 'Can I start in November?',
        note: null,
        consent_text_version: 'lead-consent.v1',
        request_ip_hash: createHash('sha256').update('203.0.113.77').digest('hex'),
        version: 1,
      });
      expect(row?.consented_at).toBeInstanceOf(Date);

      const events = await expectEvents(db, { type: LeadCaptured, aggregateId: id });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        schoolId: A.schoolId,
        aggregateType: 'lead',
        aggregateVersion: 1,
        actorUserId: null,
        payload: {
          leadId: id,
          source: 'page',
          licenceClass: 'B',
          isMinor: false,
          fullName: 'Lena Lead',
          capturedAt: expect.any(String),
        },
      });
    });

    it('silently accepts the honeypot', async () => {
      const phone = uniquePhone();
      const res = await capture(leadBody({ phone, website: 'https://spam.example.com' }));

      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({ id: expect.any(String) });
      const rows = await system.query(`select id from leads where id = $1 or phone = $2`, [
        res.body.id,
        phone,
      ]);
      expect(rows.rows).toEqual([]);
      expect(await expectEvents(db, { type: LeadCaptured, aggregateId: res.body.id })).toEqual([]);
    });

    it('dedupes by phone within 30 days and appends the message to the note', async () => {
      const phone = uniquePhone();
      const first = await captured(leadBody({ phone, message: 'First' }));
      const second = await captured(leadBody({ phone, message: 'Second' }));
      const third = await captured(leadBody({ phone, message: 'Third' }));

      expect(second).toBe(first);
      expect(third).toBe(first);
      expect(await leadRow(first)).toMatchObject({
        message: 'First',
        note: 'Second\n---\nThird',
        version: 3,
      });
      expect(await expectEvents(db, { type: LeadCaptured, aggregateId: first })).toHaveLength(1);
    });

    it('dedupes by email case-insensitively', async () => {
      const email = uniqueEmail();
      const first = await captured(leadBody({ phone: undefined, email }));
      const second = await captured(
        leadBody({ phone: undefined, email: email.toUpperCase(), message: undefined }),
      );

      expect(second).toBe(first);
      expect(await leadRow(first)).toMatchObject({ note: null, version: 2 });
    });

    it('rejects a minor without guardian details', async () => {
      const res = await capture(leadBody({ isMinor: true }));

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
      expect(res.body.error.details.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['guardianName'] }),
          expect.objectContaining({ path: ['guardianContact'] }),
        ]),
      );
    });

    it('rejects a lead without a phone or an email', async () => {
      const res = await capture(leadBody({ phone: undefined }));

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.details.issues).toEqual([expect.objectContaining({ path: ['phone'] })]);
    });

    it('returns 404 for an unpublished school or one without the feature', async () => {
      const unknown = await capture(leadBody(), `nobody-${randomUUID().slice(0, 8)}`);
      expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
      expect(unknown.body.error.code).toBe('school_not_found');

      await system.query(
        `insert into school_public_profiles (school_id, slug, published) values ($1, $2, false)`,
        [B.schoolId, slugB],
      );
      const unpublished = await capture(leadBody(), slugB);
      expect(unpublished.status).toBe(StatusCodes.NOT_FOUND);
      expect(unpublished.body.error.code).toBe('school_not_found');

      // B's plan has no enrolment_page feature.
      await system.query(
        `update school_public_profiles set published = true where school_id = $1`,
        [B.schoolId],
      );
      const withoutFeature = await capture(leadBody(), slugB);
      expect(withoutFeature.status).toBe(StatusCodes.NOT_FOUND);
      expect(withoutFeature.body.error.code).toBe('school_not_found');

      const inB = await system.query(`select id from leads where school_id = $1`, [B.schoolId]);
      expect(inB.rows).toEqual([]);
    });
  });

  describe('staff routes', () => {
    it('adds a manual lead for a walk-in', async () => {
      const res = await http.post('/v1/leads').set(office.headers).send({
        fullName: 'Walter Walk-in',
        phone: uniquePhone(),
        licenceClass: 'A',
        isMinor: false,
      });

      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({ id: expect.any(String), version: 1 });
      expect(await leadRow(res.body.id)).toMatchObject({
        source: 'manual',
        consent_text_version: 'manual',
        request_ip_hash: null,
      });
      const [event] = await expectEvents(db, { type: LeadCaptured, aggregateId: res.body.id });
      expect(event?.payload).toMatchObject({ source: 'manual', licenceClass: 'A' });
      expect(event?.actorUserId).toBe(office.userId);
    });

    it('answers 403 feature_not_in_plan for a manual lead without the plan feature', async () => {
      const res = await http
        .post('/v1/leads')
        .set(authHeaders(B))
        .send({ fullName: 'No Plan', phone: uniquePhone(), licenceClass: 'B', isMinor: false });

      expect(res.status).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.error.code).toBe('feature_not_in_plan');
    });

    it('keeps leads away from instructors', async () => {
      expect((await http.get('/v1/leads').set(ingo.headers)).status).toBe(StatusCodes.FORBIDDEN);
      const create = await http
        .post('/v1/leads')
        .set(ingo.headers)
        .send({ fullName: 'Nope', phone: uniquePhone(), licenceClass: 'B', isMinor: false });
      expect(create.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('lists leads newest first with status filter and cursor', async () => {
      const tag = randomUUID().slice(0, 8);
      const ids: string[] = [];
      for (const n of [1, 2, 3]) {
        const res = await http
          .post('/v1/leads')
          .set(office.headers)
          .send({
            fullName: `Pager ${tag} ${n}`,
            email: uniqueEmail(),
            licenceClass: 'B',
            isMinor: false,
          });
        expect(res.status).toBe(StatusCodes.CREATED);
        ids.push(res.body.id as string);
      }

      const first = await http.get('/v1/leads').set(office.headers).query({ q: tag, limit: 2 });
      expect(first.status).toBe(StatusCodes.OK);
      expect(first.body.items.map((lead: { id: string }) => lead.id)).toEqual([ids[2], ids[1]]);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      expect(first.body.items[0]).toMatchObject({
        fullName: `Pager ${tag} 3`,
        status: 'new',
        source: 'manual',
        version: 1,
      });

      const second = await http
        .get('/v1/leads')
        .set(office.headers)
        .query({ q: tag, limit: 2, cursor: first.body.nextCursor });
      expect(second.body.items.map((lead: { id: string }) => lead.id)).toEqual([ids[0]]);
      expect(second.body.nextCursor).toBeNull();

      const lost = await http
        .patch(`/v1/leads/${ids[1]}`)
        .set(office.headers)
        .send({ status: 'lost', lostReason: 'Moved away' });
      expect(lost.status).toBe(StatusCodes.OK);

      const onlyLost = await http
        .get('/v1/leads')
        .set(office.headers)
        .query({ q: tag, status: 'lost' });
      expect(onlyLost.body.items.map((lead: { id: string }) => lead.id)).toEqual([ids[1]]);
      const onlyNew = await http
        .get('/v1/leads')
        .set(office.headers)
        .query({ q: tag, status: 'new' });
      expect(onlyNew.body.items.map((lead: { id: string }) => lead.id)).toEqual([ids[2], ids[0]]);
    });

    it('marks contacted and lost with a reason', async () => {
      const phone = uniquePhone();
      const id = await captured(leadBody({ phone }));

      const contacted = await http
        .patch(`/v1/leads/${id}`)
        .set(office.headers)
        .send({ status: 'contacted', note: 'Called, will think about it' });
      expect(contacted.status, JSON.stringify(contacted.body)).toBe(StatusCodes.OK);
      expect(contacted.body).toEqual({ id, version: 2 });

      const noteOnly = await http
        .patch(`/v1/leads/${id}`)
        .set(office.headers)
        .send({ note: 'Called again' });
      expect(noteOnly.body).toEqual({ id, version: 3 });

      const lost = await http
        .patch(`/v1/leads/${id}`)
        .set(office.headers)
        .send({ status: 'lost', lostReason: 'Chose another school' });
      expect(lost.body).toEqual({ id, version: 4 });

      const get = await http.get(`/v1/leads/${id}`).set(office.headers);
      expect(get.status).toBe(StatusCodes.OK);
      expect(get.body).toMatchObject({
        id,
        status: 'lost',
        note: 'Called again',
        lostReason: 'Chose another school',
        lostAt: expect.any(String),
        version: 4,
      });

      const events = await expectEvents(db, { type: LeadStatusChanged, aggregateId: id });
      expect(events.map((event) => [event.aggregateVersion, event.payload.status])).toEqual([
        [2, 'contacted'],
        [4, 'lost'],
      ]);

      const reasonWithoutLost = await http
        .patch(`/v1/leads/${id}`)
        .set(office.headers)
        .send({ lostReason: 'No status' });
      expect(reasonWithoutLost.status).toBe(StatusCodes.BAD_REQUEST);

      // A lost lead never absorbs a new enquiry.
      const again = await captured(leadBody({ phone }));
      expect(again).not.toBe(id);
    });

    it('returns 404 for an unknown lead', async () => {
      const id = newId();
      expect((await http.get(`/v1/leads/${id}`).set(office.headers)).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      const patch = await http.patch(`/v1/leads/${id}`).set(office.headers).send({ note: 'x' });
      expect(patch.status).toBe(StatusCodes.NOT_FOUND);
      const convert = await http
        .post(`/v1/leads/${id}/convert`)
        .set(office.headers)
        .set('Idempotency-Key', `convert-${randomUUID()}`)
        .send({ dateOfBirth: '2004-05-06', examLanguage: 'en' });
      expect(convert.status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('POST /v1/leads/:id/convert', () => {
    it('converts a lead into a student and an invitation once', async () => {
      const phone = uniquePhone();
      const leadId = await captured(
        leadBody({ fullName: 'Conny Convert', phone, licenceClass: 'BE' }),
      );
      const key = `convert-${randomUUID()}`;
      const body = {
        primaryInstructorMembershipId: ingo.membershipId,
        dateOfBirth: '2004-05-06',
        examLanguage: 'en',
        invite: true,
        inviteParent: false,
      };

      const first = await http
        .post(`/v1/leads/${leadId}/convert`)
        .set(office.headers)
        .set('Idempotency-Key', key)
        .send(body);
      expect(first.status, JSON.stringify(first.body)).toBe(StatusCodes.CREATED);
      expect(first.body).toEqual({
        id: leadId,
        version: 2,
        studentId: expect.any(String),
        invitationId: expect.any(String),
        parentInvitationId: null,
      });

      const replay = await http
        .post(`/v1/leads/${leadId}/convert`)
        .set(office.headers)
        .set('Idempotency-Key', key)
        .send(body);
      expect(replay.body).toEqual(first.body);

      const again = await http
        .post(`/v1/leads/${leadId}/convert`)
        .set(office.headers)
        .set('Idempotency-Key', `other-${randomUUID()}`)
        .send(body);
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(again.body.error.code).toBe('lead_already_converted');

      const studentId = first.body.studentId as string;
      const student = await system.query(
        `select full_name, licence_class, date_of_birth::text as dob, school_id from students where id = $1`,
        [studentId],
      );
      expect(student.rows).toEqual([
        {
          full_name: 'Conny Convert',
          licence_class: 'BE',
          dob: '2004-05-06',
          school_id: A.schoolId,
        },
      ]);
      const assigned = await system.query(
        `select instructor_membership_id from student_instructors where student_id = $1`,
        [studentId],
      );
      expect(assigned.rows).toEqual([{ instructor_membership_id: ingo.membershipId }]);
      const invitations = await system.query(
        `select id, roles, phone, student_id from invitations where student_id = $1`,
        [studentId],
      );
      expect(invitations.rows).toEqual([
        { id: first.body.invitationId, roles: ['student'], phone, student_id: studentId },
      ]);
      expect(await leadRow(leadId)).toMatchObject({
        status: 'converted',
        student_id: studentId,
        converted_at: expect.any(Date),
        version: 2,
      });

      const converted = await expectEvents(db, { type: LeadConverted, aggregateId: leadId });
      expect(converted).toHaveLength(1);
      expect(converted[0]).toMatchObject({
        aggregateType: 'lead',
        aggregateVersion: 2,
        actorUserId: office.userId,
        payload: { leadId, studentId, convertedAt: expect.any(String) },
      });

      const patch = await http
        .patch(`/v1/leads/${leadId}`)
        .set(office.headers)
        .send({ status: 'lost', lostReason: 'Too late' });
      expect(patch.status).toBe(StatusCodes.CONFLICT);
      expect(patch.body.error.code).toBe('lead_already_converted');
    });

    it('converting a minor lead links the guardian and invites them when asked', async () => {
      const guardianEmail = uniqueEmail();
      const leadId = await captured(
        leadBody({
          fullName: 'Mila Minor',
          isMinor: true,
          guardianName: 'Markus Minor',
          guardianContact: guardianEmail,
        }),
      );

      const res = await http
        .post(`/v1/leads/${leadId}/convert`)
        .set(office.headers)
        .set('Idempotency-Key', `convert-${randomUUID()}`)
        .send({ dateOfBirth: '2010-02-03', examLanguage: 'en', invite: false, inviteParent: true });

      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({
        invitationId: null,
        parentInvitationId: expect.any(String),
      });
      const invitations = await system.query(
        `select id, roles, email, phone from invitations where student_id = $1`,
        [res.body.studentId],
      );
      expect(invitations.rows).toEqual([
        { id: res.body.parentInvitationId, roles: ['parent'], email: guardianEmail, phone: null },
      ]);
    });

    it('rejects a body without the date of birth', async () => {
      const leadId = await captured(leadBody());
      const res = await http
        .post(`/v1/leads/${leadId}/convert`)
        .set(office.headers)
        .set('Idempotency-Key', `convert-${randomUUID()}`)
        .send({ examLanguage: 'en' });

      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.details.issues).toEqual([
        expect.objectContaining({ path: ['dateOfBirth'] }),
      ]);
    });
  });
});
