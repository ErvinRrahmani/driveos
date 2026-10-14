import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessTokenService } from '../../src/kernel/auth/access-token.js';
import { RedisConnection } from '../../src/kernel/redis/redis-connection.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { ROLE_PERMISSIONS, type Role } from '../../src/modules/identity/domain/permissions.js';
import { permissionGrants } from '../../src/modules/identity/infra/schema.js';
import { PermissionGrantsCache } from '../../src/modules/identity/infra/permission-grants.cache.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { authHeadersFor, createTestTenants, type TestTenants } from '../support/tenants.js';
import { PermissionProbeModule, PROBE_ROUTES } from './permission-probe.js';
import { codeFrom, createUser, uniquePhone } from './support.js';
import { StatusCodes } from 'http-status-codes';

const SCHOOL_ROLES: Role[] = ['owner', 'office', 'instructor', 'student', 'parent'];

describe('PermissionGuard', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db, [PermissionProbeModule], {
      env: { AUTH_CODES_PER_IP: '1000' },
    });
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const call = (method: 'GET' | 'POST', path: string, headers: Record<string, string>) =>
    (method === 'GET' ? http.get(path) : http.post(path)).set(headers);

  const asRoles = (roles: Role[], membershipId: string = randomUUID()) =>
    authHeadersFor(tenants.A, { roles, membershipId });

  describe('each school role against the permission map, through HTTP', () => {
    const cases = SCHOOL_ROLES.flatMap((role) =>
      PROBE_ROUTES.map((route) => ({
        role,
        ...route,
        allowed: ROLE_PERMISSIONS[role].has(route.permission),
      })),
    );

    it.each(cases)(
      '$role → $method $path ($permission): allowed=$allowed',
      async ({ role, method, path, permission, allowed }) => {
        const res = await call(method, path, asRoles([role]));
        if (allowed) {
          expect(res.status, res.text).toBe(StatusCodes.OK);
        } else {
          expect(res.status, res.text).toBe(StatusCodes.FORBIDDEN);
          expect(res.body).toEqual({
            error: { code: 'forbidden', message: expect.any(String), details: { permission } },
          });
        }
      },
    );
  });

  it('lets any authenticated principal call a route without a permission declaration', async () => {
    await call('GET', '/v1/probe/open', asRoles(['student'])).expect(StatusCodes.OK);
    await call('POST', '/v1/probe/open', asRoles([])).expect(StatusCodes.OK);
  });

  it('answers 401, not 403, without credentials (AuthGuard runs first)', async () => {
    const res = await http.post('/v1/probe/invitations');
    expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  it('accepts any one of the permissions of @RequireAnyPermission', async () => {
    await call('GET', '/v1/probe/any', asRoles(['office'])).expect(StatusCodes.OK);
    await call('GET', '/v1/probe/any', asRoles(['instructor'])).expect(StatusCodes.OK);
    const res = await call('GET', '/v1/probe/any', asRoles(['student']));
    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(res.body.error).toMatchObject({
      code: 'forbidden',
      details: { anyOf: ['students.read', 'progress.write.own'] },
    });
  });

  it('answers 403 school_required to a principal without a school', async () => {
    const res = await call(
      'GET',
      '/v1/probe/calendar',
      authHeadersFor(null, { userId: tenants.A.ownerUserId, roles: ['owner'] }),
    );
    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(res.body.error.code).toBe('school_required');
  });

  describe('owner + instructor in one membership (real login)', () => {
    it('gets the union of both permission sets', async () => {
      const user = await createUser(tenants, {
        phone: uniquePhone(),
        memberships: [{ tenant: tenants.A, roles: ['owner', 'instructor'] }],
      });
      await http.post('/v1/auth/code').send({ contact: user.phone }).expect(StatusCodes.ACCEPTED);
      const code = codeFrom(kernel.sms.last()?.body);
      const session = await http
        .post('/v1/auth/verify')
        .send({ contact: user.phone, code, client: 'web' })
        .expect(StatusCodes.OK);
      const bearer = { Authorization: `Bearer ${session.body.accessToken as string}` };

      await call('POST', '/v1/probe/invitations', bearer).expect(StatusCodes.OK);
      await call('GET', '/v1/probe/students-own', bearer).expect(StatusCodes.OK);
      await call('GET', '/v1/probe/prices', bearer).expect(StatusCodes.OK);
      await call('POST', '/v1/probe/theory', bearer).expect(StatusCodes.OK);
      const res = await call('GET', '/v1/probe/platform', bearer);
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('permission grants', () => {
    it('adds a granted permission to the roles (office + prices.manage)', async () => {
      const office = await createUser(tenants, {
        memberships: [{ tenant: tenants.A, roles: ['office'] }],
      });
      const membershipId = office.membershipIds[0] as string;
      const headers = authHeadersFor(tenants.A, {
        roles: ['office'],
        membershipId,
        userId: office.userId,
      });
      await tenants.asSchool(tenants.A, (tx) =>
        tx
          .insert(permissionGrants)
          .values({ schoolId: tenants.A.schoolId, membershipId, permission: 'prices.manage' }),
      );

      await call('GET', '/v1/probe/prices', headers).expect(StatusCodes.OK);
      await call('GET', '/v1/probe/platform', headers).expect(StatusCodes.FORBIDDEN);
    });

    it('caches grants in Redis under perm:<schoolId>:<membershipId> until invalidated', async () => {
      const office = await createUser(tenants, {
        memberships: [{ tenant: tenants.A, roles: ['office'] }],
      });
      const membershipId = office.membershipIds[0] as string;
      const headers = authHeadersFor(tenants.A, {
        roles: ['office'],
        membershipId,
        userId: office.userId,
      });
      await call('GET', '/v1/probe/prices', headers).expect(StatusCodes.FORBIDDEN);
      const redis = kernel.app.get(RedisConnection);
      const key = `${redis.prefix}:perm:${tenants.A.schoolId}:${membershipId}`;
      expect(await redis.client.get(key)).toBe('[]');
      expect(await redis.client.ttl(key)).toBeGreaterThan(0);

      await tenants.asSchool(tenants.A, (tx) =>
        tx
          .insert(permissionGrants)
          .values({ schoolId: tenants.A.schoolId, membershipId, permission: 'prices.manage' }),
      );
      await call('GET', '/v1/probe/prices', headers).expect(StatusCodes.FORBIDDEN);

      await kernel.app.get(PermissionGrantsCache).invalidate(tenants.A.schoolId, membershipId);
      await call('GET', '/v1/probe/prices', headers).expect(StatusCodes.OK);
      expect(await redis.client.get(key)).toBe('["prices.manage"]');
    });

    it("never applies another school's grants (RLS on the fill, school in the cache key)", async () => {
      const office = await createUser(tenants, {
        memberships: [{ tenant: tenants.A, roles: ['office'] }],
      });
      const membershipId = office.membershipIds[0] as string;
      await tenants.asSchool(tenants.A, (tx) =>
        tx
          .insert(permissionGrants)
          .values({ schoolId: tenants.A.schoolId, membershipId, permission: 'prices.manage' }),
      );
      const asA = authHeadersFor(tenants.A, {
        roles: ['office'],
        membershipId,
        userId: office.userId,
      });
      const asB = authHeadersFor(tenants.B, {
        roles: ['office'],
        membershipId,
        userId: office.userId,
      });

      await call('GET', '/v1/probe/prices', asA).expect(StatusCodes.OK);
      await call('GET', '/v1/probe/prices', asB).expect(StatusCodes.FORBIDDEN);
    });
  });

  describe('support sessions (read-only)', () => {
    async function supportBearer() {
      const admin = await createUser(tenants, { platformAdmin: true });
      const sessionId = randomUUID();
      await tenants.asSystem((tx) =>
        tx.execute(sql`insert into support_sessions
            (id, platform_admin_user_id, school_id, reason, started_at, expires_at)
          values (${sessionId}, ${admin.userId}, ${tenants.A.schoolId}, 'probe', now(),
            now() + interval '30 minutes')`),
      );
      const { token } = await kernel.app.get(AccessTokenService).sign({
        userId: admin.userId,
        membershipId: null,
        schoolId: tenants.A.schoolId,
        roles: ['platform_admin'],
        tokenType: 'support',
        sessionId,
      });
      return { Authorization: `Bearer ${token}` };
    }

    it('allows GET routes that need a read permission', async () => {
      const bearer = await supportBearer();
      await call('GET', '/v1/probe/calendar', bearer).expect(StatusCodes.OK);
      await call('GET', '/v1/probe/any', bearer).expect(StatusCodes.OK);
      await call('GET', '/v1/probe/open', bearer).expect(StatusCodes.OK);
    });

    it('denies private notes, write permissions and every non-GET request', async () => {
      const bearer = await supportBearer();
      const notes = await call('GET', '/v1/probe/private-notes', bearer);
      expect(notes.status).toBe(StatusCodes.FORBIDDEN);
      expect(notes.body.error).toMatchObject({
        code: 'forbidden',
        details: { permission: 'private_notes.read' },
      });
      await call('GET', '/v1/probe/prices', bearer).expect(StatusCodes.FORBIDDEN);
      await call('GET', '/v1/probe/platform', bearer).expect(StatusCodes.FORBIDDEN);
      for (const path of ['/v1/probe/lessons', '/v1/probe/open']) {
        const res = await call('POST', path, bearer);
        expect(res.status).toBe(StatusCodes.FORBIDDEN);
        expect(res.body.error).toMatchObject({
          code: 'forbidden',
          details: { reason: 'support_read_only' },
        });
      }
    });
  });

  describe('platform admins', () => {
    it('reach platform.manage without a school, but no school permission', async () => {
      const admin = await createUser(tenants, { platformAdmin: true });
      const headers = authHeadersFor(null, { userId: admin.userId, roles: ['platform_admin'] });
      await call('GET', '/v1/probe/platform', headers).expect(StatusCodes.OK);
      const res = await call('GET', '/v1/probe/calendar', headers);
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.error.code).toBe('school_required');
    });
  });
});
