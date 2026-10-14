import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createUser, type TestUser } from '../identity/support.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { dateYearsAgo, studentBody } from './support.js';
import { StatusCodes } from 'http-status-codes';

describe('GET /v1/guardian-links', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    A = tenants.A;
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const createStudent = async (fullName: string, years: number) =>
    (
      await http
        .post('/v1/students')
        .set(authHeaders(A))
        .send(studentBody({ fullName, dateOfBirth: dateYearsAgo(years) }))
        .expect(StatusCodes.CREATED)
    ).body.id as string;

  const link = async (studentId: string, guardian: TestUser) =>
    (
      await http
        .post(`/v1/students/${studentId}/guardians`)
        .set(authHeaders(A))
        .send({ guardianUserId: guardian.userId })
        .expect(StatusCodes.CREATED)
    ).body.id as string;

  const asParent = (parent: TestUser) =>
    authHeadersFor(A, {
      userId: parent.userId,
      membershipId: parent.membershipIds[0],
      roles: ['parent'],
    });

  it("lists the caller's guardian links with the student's name and consent state", async () => {
    const parent = await createUser(tenants, { memberships: [{ tenant: A, roles: ['parent'] }] });
    const other = await createUser(tenants, { memberships: [{ tenant: A, roles: ['parent'] }] });
    const minorId = await createStudent('Mila Minor', 15);
    const adultId = await createStudent('Ada Adult', 30);
    const consentedId = await createStudent('Cora Consented', 16);
    const minorLink = await link(minorId, parent);
    const adultLink = await link(adultId, parent);
    const consentedLink = await link(consentedId, parent);
    await link(minorId, other);
    await http
      .post(`/v1/guardians/${consentedLink}/consent`)
      .set(asParent(parent))
      .send({ consentTextVersion: '2026-09' })
      .expect(StatusCodes.OK);
    const revokedId = await createStudent('Rex Revoked', 15);
    const revokedLink = await link(revokedId, parent);
    await system.query(`update guardian_links set revoked_at = now() where id = $1`, [revokedLink]);

    const res = await http.get('/v1/guardian-links').set(asParent(parent)).expect(StatusCodes.OK);

    expect(res.body.nextCursor).toBeNull();
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items).toEqual(
      expect.arrayContaining([
        {
          id: minorLink,
          studentId: minorId,
          studentName: 'Mila Minor',
          status: 'pending_consent',
          consentAt: null,
          createdAt: expect.any(String),
        },
        {
          id: adultLink,
          studentId: adultId,
          studentName: 'Ada Adult',
          status: 'not_required',
          consentAt: null,
          createdAt: expect.any(String),
        },
        {
          id: consentedLink,
          studentId: consentedId,
          studentName: 'Cora Consented',
          status: 'consented',
          consentAt: expect.any(String),
          createdAt: expect.any(String),
        },
      ]),
    );

    const page = await http
      .get('/v1/guardian-links?limit=2')
      .set(asParent(parent))
      .expect(StatusCodes.OK);
    expect(page.body.items).toHaveLength(2);
    const rest = await http
      .get(`/v1/guardian-links?limit=2&cursor=${page.body.nextCursor as string}`)
      .set(asParent(parent))
      .expect(StatusCodes.OK);
    expect(rest.body).toMatchObject({ nextCursor: null });
    expect(
      [...page.body.items, ...rest.body.items].map((item: { id: string }) => item.id).sort(),
    ).toEqual([minorLink, adultLink, consentedLink].sort());
  });

  it('is for parents only', async () => {
    const student = await createUser(tenants, {
      memberships: [{ tenant: A, roles: ['student'] }],
    });
    await http
      .get('/v1/guardian-links')
      .set(
        authHeadersFor(A, {
          userId: student.userId,
          membershipId: student.membershipIds[0],
          roles: ['student'],
        }),
      )
      .expect(StatusCodes.FORBIDDEN);
  });
});
