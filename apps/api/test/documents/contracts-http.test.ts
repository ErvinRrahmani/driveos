import { ContractCompleted, ContractCreated, ContractSigned } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent } from '../identity/support.js';
import { expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createLogin, dateYearsAgo, linkGuardianRow, type Login } from '../training/support.js';

const AGENT = 'DriveOS-Test/1.0';
const BODY = 'SAMPLE contract: the school teaches, the student learns.';

describe('contracts HTTP', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let office: Login;
  let ada: Login;
  let mia: Login;
  let gus: Login;
  let nina: Login;
  let otto: Login;
  let adaId: string;
  let miaId: string;
  let templateId: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    office = await createLogin(tenants, A, ['office']);
    ada = await createLogin(tenants, A, ['student']);
    mia = await createLogin(tenants, A, ['student']);
    gus = await createLogin(tenants, A, ['parent']);
    nina = await createLogin(tenants, A, ['parent']);
    otto = await createLogin(tenants, A, ['student']);
    adaId = await createStudent(tenants, A, { dateOfBirth: '1999-05-05', userId: ada.userId });
    miaId = await createStudent(tenants, A, { dateOfBirth: dateYearsAgo(16), userId: mia.userId });
    await createStudent(tenants, A, { dateOfBirth: '1999-05-05', userId: otto.userId });
    await linkGuardianRow(tenants, A, miaId, gus.userId, new Date());
    await linkGuardianRow(tenants, A, miaId, nina.userId, null);
    const created = await http
      .post('/v1/contract-templates')
      .set(office.headers)
      .send({ name: 'Training contract', body: BODY });
    expect(created.status, JSON.stringify(created.body)).toBe(StatusCodes.CREATED);
    templateId = created.body.id as string;
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const createContract = async (studentId: string) => {
    const res = await http
      .post('/v1/contracts')
      .set(office.headers)
      .send({ studentId, templateId });
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    expect(res.body.version).toBe(1);
    return res.body.id as string;
  };

  const sign = (login: Login, contractId: string, body: Record<string, unknown> = {}) =>
    http
      .post(`/v1/contracts/${contractId}/sign`)
      .set(login.headers)
      .set('User-Agent', AGENT)
      .send(body);

  describe('templates', () => {
    it('versions templates by name and filters by active', async () => {
      const second = await http
        .post('/v1/contract-templates')
        .set(office.headers)
        .send({ name: 'Training contract', body: `${BODY} v2` });
      expect(second.status).toBe(StatusCodes.CREATED);
      expect(second.body.version).toBe(2);
      const retired = await http
        .post('/v1/contract-templates')
        .set(office.headers)
        .send({ name: 'Old contract', body: 'Old', active: false });
      const all = await http.get('/v1/contract-templates').set(office.headers);
      expect(all.status).toBe(StatusCodes.OK);
      expect((all.body.items as { id: string }[]).map((t) => t.id)).toEqual(
        expect.arrayContaining([templateId, second.body.id, retired.body.id]),
      );
      const active = await http
        .get('/v1/contract-templates')
        .set(office.headers)
        .query({ active: 'true' });
      expect((active.body.items as { id: string }[]).map((t) => t.id)).not.toContain(
        retired.body.id,
      );
      const inactive = await http
        .post('/v1/contracts')
        .set(office.headers)
        .send({ studentId: adaId, templateId: retired.body.id });
      expect(inactive.status).toBe(StatusCodes.CONFLICT);
      expect(inactive.body.error.code).toBe('contract_template_inactive');
    });

    it('is staff-only', async () => {
      await http.get('/v1/contract-templates').set(mia.headers).expect(StatusCodes.FORBIDDEN);
      await http
        .post('/v1/contracts')
        .set(mia.headers)
        .send({ studentId: miaId, templateId })
        .expect(StatusCodes.FORBIDDEN);
    });
  });

  describe("a minor's contract", () => {
    let contractId: string;

    beforeAll(async () => {
      contractId = await createContract(miaId);
    });

    it('snapshots the template and names the student and the consenting guardian as signers', async () => {
      const [created] = await expectEvents(db, { type: ContractCreated, aggregateId: contractId });
      expect(created?.payload).toEqual({
        contractId,
        studentId: miaId,
        templateId,
        templateVersion: 1,
        requiresGuardian: true,
        signerUserIds: [mia.userId, gus.userId],
      });
      const res = await http.get(`/v1/contracts/${contractId}`).set(office.headers);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({
        id: contractId,
        studentId: miaId,
        body: BODY,
        templateVersion: 1,
        requiresGuardian: true,
        requiredSignerRoles: ['student', 'guardian'],
        status: 'pending',
        completedAt: null,
        signatures: [],
      });
    });

    it("is not complete with only the student's signature", async () => {
      const res = await sign(mia, contractId);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ contractId, status: 'pending', completedAt: null });
      const [signed] = await expectEvents(db, { type: ContractSigned, aggregateId: contractId });
      expect(signed?.payload).toMatchObject({ signerUserId: mia.userId, signerRole: 'student' });
      expect(await expectEvents(db, { type: ContractCompleted, aggregateId: contractId })).toEqual(
        [],
      );
      const view = await http.get(`/v1/contracts/${contractId}`).set(mia.headers);
      expect(view.body.status).toBe('pending');
      expect(view.body.signatures).toHaveLength(1);
    });

    it('refuses a second signature in the same role', async () => {
      const res = await sign(mia, contractId);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('already_signed');
    });

    it('refuses a role the signer does not hold and guardians without consent', async () => {
      expect((await sign(gus, contractId, { role: 'student' })).status).toBe(StatusCodes.FORBIDDEN);
      expect((await sign(gus, contractId, { role: 'school' })).status).toBe(StatusCodes.FORBIDDEN);
      expect((await sign(nina, contractId)).status).toBe(StatusCodes.NOT_FOUND);
      expect((await sign(otto, contractId)).status).toBe(StatusCodes.NOT_FOUND);
    });

    it('does not let staff sign for the student', async () => {
      expect((await sign(office, contractId)).status).toBe(StatusCodes.FORBIDDEN);
      const owner = await http
        .post(`/v1/contracts/${contractId}/sign`)
        .set(authHeaders(A))
        .send({ role: 'student' });
      expect(owner.status).toBe(StatusCodes.FORBIDDEN);
    });

    it("completes with the consenting guardian's signature and records who, when, IP and user agent", async () => {
      const res = await sign(gus, contractId);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({
        contractId,
        status: 'signed',
        completedAt: expect.any(String),
      });
      const [completed] = await expectEvents(db, {
        type: ContractCompleted,
        aggregateId: contractId,
      });
      expect(completed?.payload).toEqual({
        contractId,
        studentId: miaId,
        completedAt: res.body.completedAt,
      });
      const rows = await system.query<{
        signer_user_id: string;
        signer_role: string;
        ip: string;
        user_agent: string;
      }>(
        `select signer_user_id, signer_role, host(ip) as ip, user_agent
           from contract_signatures where contract_id = $1 order by signed_at`,
        [contractId],
      );
      expect(rows.rows.map((row) => [row.signer_user_id, row.signer_role])).toEqual([
        [mia.userId, 'student'],
        [gus.userId, 'guardian'],
      ]);
      for (const row of rows.rows) {
        expect(row.user_agent).toBe(AGENT);
        expect(row.ip).toMatch(/127\.0\.0\.1|::1/);
      }
      const view = await http.get(`/v1/contracts/${contractId}`).set(gus.headers);
      expect(view.body.status).toBe('signed');
      expect(
        (view.body.signatures as { signerRole: string; signerName: string }[]).map(
          (s) => s.signerRole,
        ),
      ).toEqual(['student', 'guardian']);
    });
  });

  it("completes an adult's contract with the student's signature", async () => {
    const contractId = await createContract(adaId);
    const [created] = await expectEvents(db, { type: ContractCreated, aggregateId: contractId });
    expect(created?.payload).toMatchObject({
      requiresGuardian: false,
      signerUserIds: [ada.userId],
    });
    expect((await sign(gus, contractId)).status).toBe(StatusCodes.NOT_FOUND);
    const res = await sign(ada, contractId);
    expect(res.body).toMatchObject({ status: 'signed' });
  });

  describe('reading and listing', () => {
    let miaContract: string;
    let adaContract: string;

    beforeAll(async () => {
      miaContract = await createContract(miaId);
      adaContract = await createContract(adaId);
    });

    const listIds = async (headers: Record<string, string>, query: Record<string, string> = {}) => {
      const res = await http.get('/v1/contracts').set(headers).query(query);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      return (res.body.items as { id: string }[]).map((item) => item.id);
    };

    it('lists all contracts for staff, filtered by student', async () => {
      const ids = await listIds(office.headers, { studentId: miaId });
      expect(ids).toContain(miaContract);
      expect(ids).not.toContain(adaContract);
      const res = await http.get('/v1/contracts').set(office.headers).query({ studentId: miaId });
      const item = (res.body.items as { id: string }[]).find((c) => c.id === miaContract);
      expect(item).toMatchObject({
        templateName: 'Training contract',
        requiredSignerRoles: ['student', 'guardian'],
        signedRoles: [],
        status: 'pending',
      });
    });

    it('lists own contracts for students and linked ones for parents', async () => {
      const own = await listIds(mia.headers);
      expect(own).toContain(miaContract);
      expect(own).not.toContain(adaContract);
      const linked = await listIds(gus.headers);
      expect(linked).toContain(miaContract);
      expect(linked).not.toContain(adaContract);
      expect(await listIds(nina.headers)).toEqual([]);
      const other = await http.get('/v1/contracts').set(mia.headers).query({ studentId: adaId });
      expect(other.status).toBe(StatusCodes.NOT_FOUND);
    });

    it('hides contracts from other students, other parents and other schools', async () => {
      for (const headers of [otto.headers, nina.headers, authHeaders(B)]) {
        const res = await http.get(`/v1/contracts/${miaContract}`).set(headers);
        expect(res.status).toBe(StatusCodes.NOT_FOUND);
      }
      expect(await listIds(authHeaders(B))).toEqual([]);
    });

    it('audits staff reads of a contract', async () => {
      await http.get(`/v1/contracts/${adaContract}`).set(office.headers).expect(StatusCodes.OK);
      const rows = await system.query<{ action: string }>(
        `select action from audit_log where target_id = $1`,
        [adaContract],
      );
      expect(rows.rows.map((row) => row.action)).toEqual(['contract.read']);
    });
  });
});
