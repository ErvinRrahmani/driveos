import {
  MembershipDisabled,
  MembershipPermissionsChanged,
  MembershipRolesChanged,
} from '@driveos/shared';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { PermissionProbeModule } from './permission-probe.js';
import { createBranch, createUser, type TestUser, uniquePhone, waitForCode } from './support.js';
import { StatusCodes } from 'http-status-codes';

describe('PATCH /v1/memberships/{id}', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db, [PermissionProbeModule], {
      env: { AUTH_CODES_PER_IP: '1000' },
    });
    worker = await createWorkerTestHarness(db, [], { JOBS_PREFIX: kernel.redisPrefix });
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    A = tenants.A;
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const patch = (id: string, body: Record<string, unknown>, headers = authHeaders(A)) =>
    http.patch(`/v1/memberships/${id}`).set(headers).send(body);

  const member = (roles: string[], extra: { phone?: string } = {}) =>
    createUser(tenants, { ...extra, memberships: [{ tenant: A, roles }] });

  const idOf = (user: TestUser) => user.membershipIds[0] as string;

  const row = async (id: string) =>
    (
      await system.query<{ roles: string[]; status: string; version: number }>(
        `select roles, status, version from memberships where id = $1`,
        [id],
      )
    ).rows[0];

  it('replaces the roles and appends MembershipRolesChanged + MembershipPermissionsChanged', async () => {
    const office = await member(['office']);
    const id = idOf(office);

    const res = await patch(id, { roles: ['instructor', 'office'] }).expect(StatusCodes.OK);

    expect(res.body).toEqual({ id, version: 3 });
    expect(await row(id)).toEqual({
      roles: ['office', 'instructor'],
      status: 'active',
      version: 3,
    });
    const roles = await expectEventAppended(db, { type: MembershipRolesChanged, aggregateId: id });
    expect(roles.aggregateVersion).toBe(2);
    expect(roles.payload).toMatchObject({
      schoolId: A.schoolId,
      userId: office.userId,
      roles: ['office', 'instructor'],
      previousRoles: ['office'],
    });
    const permissions = await expectEventAppended(db, {
      type: MembershipPermissionsChanged,
      aggregateId: id,
    });
    expect(permissions.aggregateVersion).toBe(3);
  });

  it('changes nothing for the same role set', async () => {
    const office = await member(['office']);
    const res = await patch(idOf(office), { roles: ['office'] }).expect(StatusCodes.OK);
    expect(res.body).toEqual({ id: idOf(office), version: 1 });
    await expectNoEvent(db, { aggregateId: idOf(office) });
  });

  it('adds and removes grants and validates their names', async () => {
    const office = await member(['office']);
    const id = idOf(office);

    await patch(id, { grants: { add: ['prices.manage', 'reports.read'] } }).expect(StatusCodes.OK);
    const res = await patch(id, { grants: { remove: ['reports.read'] } }).expect(StatusCodes.OK);

    expect(res.body.version).toBe(3);
    const { rows } = await system.query(
      `select permission from permission_grants where membership_id = $1`,
      [id],
    );
    expect(rows).toEqual([{ permission: 'prices.manage' }]);
    const event = await expectEventAppended(db, {
      type: MembershipPermissionsChanged,
      aggregateId: id,
    });
    expect(event.payload).toMatchObject({
      grants: ['prices.manage'],
      branchIds: [],
      roles: ['office'],
    });
    await expectNoEvent(db, { type: MembershipRolesChanged, aggregateId: id });

    const bad = await patch(id, { grants: { add: ['lessons.fly', 'platform.manage'] } });
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(bad.body.error).toMatchObject({
      code: 'validation_error',
      details: { permissions: ['lessons.fly', 'platform.manage'] },
    });
  });

  it('replaces branches; a branch of another school is not found', async () => {
    const office = await member(['office']);
    const id = idOf(office);
    const [b1, b2] = [await createBranch(tenants, A), await createBranch(tenants, A)];

    await patch(id, { branchIds: [b1, b2] }).expect(StatusCodes.OK);
    await patch(id, { branchIds: [b2] }).expect(StatusCodes.OK);

    const { rows } = await system.query(
      `select branch_id from membership_branches where membership_id = $1`,
      [id],
    );
    expect(rows).toEqual([{ branch_id: b2 }]);
    const foreign = await createBranch(tenants, tenants.B);
    expect((await patch(id, { branchIds: [foreign] })).status).toBe(StatusCodes.NOT_FOUND);
  });

  it('a grant takes effect once the worker processed MembershipPermissionsChanged', async () => {
    const office = await member(['office']);
    const id = idOf(office);
    const asOffice = authHeadersFor(A, {
      roles: ['office'],
      membershipId: id,
      userId: office.userId,
    });
    await http.get('/v1/probe/prices').set(asOffice).expect(StatusCodes.FORBIDDEN);

    await patch(id, { grants: { add: ['prices.manage'] } }).expect(StatusCodes.OK);
    await http.get('/v1/probe/prices').set(asOffice).expect(StatusCodes.FORBIDDEN);
    expect((await worker.drainWorker()).failed).toBe(0);

    await http.get('/v1/probe/prices').set(asOffice).expect(StatusCodes.OK);
  });

  it('is denied to office unless granted memberships.manage; only owners touch owner', async () => {
    const office = await member(['office']);
    const target = await member(['instructor']);
    const asOffice = authHeadersFor(A, {
      roles: ['office'],
      membershipId: idOf(office),
      userId: office.userId,
    });
    const denied = await patch(idOf(target), { roles: ['office'] }, asOffice);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(denied.body.error.details).toEqual({ permission: 'memberships.manage' });

    await patch(idOf(office), { grants: { add: ['memberships.manage'] } }).expect(StatusCodes.OK);
    await worker.drainWorker();
    await patch(idOf(target), { roles: ['office'] }, asOffice).expect(StatusCodes.OK);
    const owner = await patch(idOf(target), { roles: ['owner'] }, asOffice);
    expect(owner.status).toBe(StatusCodes.FORBIDDEN);
    expect(owner.body.error.code).toBe('owner_required');
    expect((await patch(A.ownerMembershipId, { disabled: true }, asOffice)).body.error.code).toBe(
      'owner_required',
    );
  });

  it('protects the last active owner', async () => {
    const lastOwner = await patch(A.ownerMembershipId, { roles: ['office'] });
    expect(lastOwner.status).toBe(StatusCodes.CONFLICT);
    expect(lastOwner.body.error.code).toBe('last_owner');
    expect((await patch(A.ownerMembershipId, { disabled: true })).body.error.code).toBe(
      'last_owner',
    );

    const second = await member(['owner', 'instructor']);
    await patch(idOf(second), { roles: ['instructor'] }).expect(StatusCodes.OK);
    await patch(idOf(second), { roles: ['owner'] }).expect(StatusCodes.OK);
    await patch(A.ownerMembershipId, { roles: ['owner', 'instructor'] }).expect(StatusCodes.OK);
    await patch(idOf(second), { disabled: true }).expect(StatusCodes.OK);
    expect((await patch(A.ownerMembershipId, { roles: ['instructor'] })).status).toBe(
      StatusCodes.CONFLICT,
    );
  });

  it('disables the membership and revokes its sessions; re-enabling makes it active again', async () => {
    const phone = uniquePhone();
    const instructor = await member(['instructor'], { phone });
    const id = idOf(instructor);
    await http.post('/v1/auth/code').send({ contact: phone }).expect(StatusCodes.ACCEPTED);
    const code = await waitForCode(kernel, phone);
    const session = await http
      .post('/v1/auth/verify')
      .send({ contact: phone, code, client: 'mobile' })
      .expect(StatusCodes.OK);
    expect(session.body.activeMembershipId).toBe(id);

    const res = await patch(id, { disabled: true }).expect(StatusCodes.OK);

    expect(res.body).toEqual({ id, version: 2 });
    expect(await row(id)).toMatchObject({ status: 'disabled' });
    const event = await expectEventAppended(db, { type: MembershipDisabled, aggregateId: id });
    expect(event).toMatchObject({ aggregateVersion: 2 });
    expect(event.payload).toEqual({
      schoolId: A.schoolId,
      membershipId: id,
      userId: instructor.userId,
      roles: ['instructor'],
    });
    const refreshed = await http
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.body.refreshToken });
    expect(refreshed.status).toBe(StatusCodes.UNAUTHORIZED);

    await patch(id, { disabled: false }).expect(StatusCodes.OK);
    expect(await row(id)).toMatchObject({ status: 'active', version: 3 });
  });

  it("answers 404 for an unknown id or another school's membership", async () => {
    const b = await createUser(tenants, {
      memberships: [{ tenant: tenants.B, roles: ['office'] }],
    });
    expect((await patch(idOf(b), { roles: ['instructor'] })).status).toBe(StatusCodes.NOT_FOUND);
    expect((await patch('0192f000-0000-7000-8000-000000000000', { disabled: true })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(await row(idOf(b))).toMatchObject({ roles: ['office'], version: 1 });
  });

  it('rejects an empty or malformed body', async () => {
    const office = await member(['office']);
    for (const body of [{}, { roles: [] }, { roles: ['platform_admin'] }, { status: 'active' }]) {
      expect((await patch(idOf(office), body)).status).toBe(StatusCodes.BAD_REQUEST);
    }
  });
});
