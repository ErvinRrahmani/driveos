import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { RefreshGraceCache } from '../../src/modules/identity/infra/refresh-grace-cache.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenants } from '../support/tenants.js';
import { permissionGrants } from '../../src/modules/identity/infra/schema.js';
import {
  birthDateYearsAgo,
  codeFrom,
  createStudent,
  createUser,
  decodeClaims,
  type TestUser,
  uniquePhone,
  type UserInput,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

interface Session {
  accessToken: string;
  refreshToken: string;
  activeMembershipId: string | null;
}

describe('sessions: refresh, logout, /v1/me, switch-school, devices', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db, [], { env: { AUTH_CODES_PER_IP: '1000' } });
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  async function login(
    input: Omit<UserInput, 'phone'> = { memberships: [{ tenant: tenants.A, roles: ['student'] }] },
    client: 'web' | 'mobile' = 'web',
  ): Promise<{ user: TestUser; session: Session }> {
    const user = await createUser(tenants, { phone: uniquePhone(), ...input });
    await http.post('/v1/auth/code').send({ contact: user.phone }).expect(StatusCodes.ACCEPTED);
    const code = codeFrom(kernel.sms.last()?.body);
    const res = await http
      .post('/v1/auth/verify')
      .send({ contact: user.phone, code, client })
      .expect(StatusCodes.OK);
    return { user, session: res.body as Session };
  }

  const refresh = (refreshToken: string) => http.post('/v1/auth/refresh').send({ refreshToken });
  const bearer = (session: Pick<Session, 'accessToken'>) => ({
    Authorization: `Bearer ${session.accessToken}`,
  });

  const familyOf = async (userId: string) =>
    (
      await system.query<{
        id: string;
        rotated_at: Date | null;
        revoked_at: Date | null;
        successor_id: string | null;
      }>(
        `select id, rotated_at, revoked_at, successor_id from refresh_tokens
          where user_id = $1 order by created_at, id`,
        [userId],
      )
    ).rows;

  describe('POST /v1/auth/refresh', () => {
    it('rotates: a new pair, the old row points at its successor', async () => {
      const { user, session } = await login();

      const res = await refresh(session.refreshToken).expect(StatusCodes.OK);

      expect(res.body.refreshToken).not.toBe(session.refreshToken);
      expect(res.body.activeMembershipId).toBe(user.membershipIds[0]);
      expect(decodeClaims(res.body.accessToken)).toMatchObject({
        sub: user.userId,
        mid: user.membershipIds[0],
        sid: tenants.A.schoolId,
      });
      const [first, second] = await familyOf(user.userId);
      expect(first?.rotated_at).not.toBeNull();
      expect(first?.successor_id).toBe(second?.id);
      expect(second?.rotated_at).toBeNull();
      await refresh(res.body.refreshToken).expect(StatusCodes.OK);
    });

    it('keeps the client lifetime when rotating a mobile token', async () => {
      const { user, session } = await login(undefined, 'mobile');

      await refresh(session.refreshToken).expect(StatusCodes.OK);

      const { rows } = await system.query<{ client: string; days: number }>(
        `select client, round(extract(epoch from expires_at - now()) / 86400)::int as days
           from refresh_tokens where user_id = $1`,
        [user.userId],
      );
      expect(rows).toEqual([
        { client: 'mobile', days: 90 },
        { client: 'mobile', days: 90 },
      ]);
    });

    it('returns the same successor to parallel refreshes within the grace window', async () => {
      const { user, session } = await login();
      const grace = kernel.app.get(RefreshGraceCache);
      const put = grace.put.bind(grace);
      grace.put = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return put(...args);
      };

      const [first, second] = await Promise.all([
        refresh(session.refreshToken),
        refresh(session.refreshToken),
      ]).finally(() => {
        grace.put = put;
      });

      expect([first.status, second.status]).toEqual([StatusCodes.OK, StatusCodes.OK]);
      expect(second.body.refreshToken).toBe(first.body.refreshToken);
      expect(await familyOf(user.userId)).toHaveLength(2);
      await refresh(first.body.refreshToken).expect(StatusCodes.OK);
    });

    it('returns the same successor when a rotated token comes back within 30 s', async () => {
      const { session } = await login();
      const first = await refresh(session.refreshToken).expect(StatusCodes.OK);

      const again = await refresh(session.refreshToken).expect(StatusCodes.OK);

      expect(again.body.refreshToken).toBe(first.body.refreshToken);
      expect(again.body.accessToken).toEqual(expect.any(String));
    });

    it('revokes the whole family when a rotated token is reused after the grace window', async () => {
      const { user, session } = await login();
      const successor = await refresh(session.refreshToken).expect(StatusCodes.OK);
      await system.query(
        `update refresh_tokens set rotated_at = now() - interval '31 seconds'
          where user_id = $1 and rotated_at is not null`,
        [user.userId],
      );

      const reused = await refresh(session.refreshToken).expect(StatusCodes.UNAUTHORIZED);

      expect(reused.body.error.code).toBe('refresh_reused');
      const family = await familyOf(user.userId);
      expect(family.every((row) => row.revoked_at !== null)).toBe(true);
      const after = await refresh(successor.body.refreshToken).expect(StatusCodes.UNAUTHORIZED);
      expect(after.body.error.code).toBe('invalid_refresh_token');
    });

    it('rejects unknown, expired and revoked refresh tokens with 401 invalid_refresh_token', async () => {
      const { user, session } = await login();
      expect((await refresh('garbage').expect(StatusCodes.UNAUTHORIZED)).body.error.code).toBe(
        'invalid_refresh_token',
      );
      await system.query(
        `update refresh_tokens set expires_at = now() - interval '1 second' where user_id = $1`,
        [user.userId],
      );

      const res = await refresh(session.refreshToken).expect(StatusCodes.UNAUTHORIZED);

      expect(res.body.error.code).toBe('invalid_refresh_token');
      await refresh('').expect(StatusCodes.BAD_REQUEST);
    });

    it('keeps a session without a school unselected when rotating', async () => {
      const { session } = await login({
        memberships: [
          { tenant: tenants.A, roles: ['instructor'] },
          { tenant: tenants.B, roles: ['instructor'] },
        ],
      });

      const res = await refresh(session.refreshToken).expect(StatusCodes.OK);

      expect(res.body.activeMembershipId).toBeNull();
      expect(decodeClaims(res.body.accessToken)).toMatchObject({ sid: null, mid: null });
    });

    it('drops the school when the bound membership was disabled', async () => {
      const { user, session } = await login();
      await system.query(`update memberships set status = 'disabled' where id = $1`, [
        user.membershipIds[0],
      ]);

      const res = await refresh(session.refreshToken).expect(StatusCodes.OK);

      expect(res.body.activeMembershipId).toBeNull();
      expect(decodeClaims(res.body.accessToken)).toMatchObject({ sid: null, roles: [] });
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('revokes the family: neither the token nor its successor refreshes afterwards', async () => {
      const { user, session } = await login();
      const successor = await refresh(session.refreshToken).expect(StatusCodes.OK);

      await http
        .post('/v1/auth/logout')
        .send({ refreshToken: successor.body.refreshToken })
        .expect(StatusCodes.NO_CONTENT);

      expect((await familyOf(user.userId)).every((row) => row.revoked_at !== null)).toBe(true);
      expect(
        (await refresh(successor.body.refreshToken).expect(StatusCodes.UNAUTHORIZED)).body.error
          .code,
      ).toBe('invalid_refresh_token');
    });

    it('answers 204 for an unknown token', async () => {
      await http
        .post('/v1/auth/logout')
        .send({ refreshToken: 'unknown' })
        .expect(StatusCodes.NO_CONTENT);
    });
  });

  describe('GET /v1/me', () => {
    it('returns the user, every membership and the active one', async () => {
      const { user, session } = await login({
        memberships: [{ tenant: tenants.A, roles: ['owner', 'instructor'] }],
      });

      const res = await http.get('/v1/me').set(bearer(session)).expect(StatusCodes.OK);

      expect(res.body).toEqual({
        user: {
          id: user.userId,
          fullName: expect.any(String),
          phone: user.phone,
          email: null,
          locale: 'en',
        },
        memberships: [
          {
            membershipId: user.membershipIds[0],
            schoolId: tenants.A.schoolId,
            schoolName: 'School A',
            roles: ['owner', 'instructor'],
            status: 'active',
          },
        ],
        active: {
          membershipId: user.membershipIds[0],
          schoolId: tenants.A.schoolId,
          roles: ['owner', 'instructor'],
          grants: expect.arrayContaining(['prices.manage', 'sync.use']),
          studentId: null,
          features: [],
        },
      });
      expect(res.body.active.grants).not.toContain('platform.manage');
    });

    it('lists role permissions plus per-membership grants, sorted', async () => {
      const { user, session } = await login({
        memberships: [{ tenant: tenants.A, roles: ['instructor'] }],
      });
      await tenants.asSchool(tenants.A, (tx) =>
        tx.insert(permissionGrants).values({
          schoolId: tenants.A.schoolId,
          membershipId: user.membershipIds[0] as string,
          permission: 'reports.read',
        }),
      );

      const res = await http.get('/v1/me').set(bearer(session)).expect(StatusCodes.OK);

      const grants = res.body.active.grants as string[];
      expect(grants).toContain('reports.read');
      expect(grants).toContain('sync.use');
      expect(grants).not.toContain('prices.manage');
      expect(grants).toEqual([...grants].sort());
      expect(res.body.active.studentId).toBeNull();
    });

    it('carries the student record linked to a student caller in the active school', async () => {
      const { user, session } = await login({
        memberships: [{ tenant: tenants.A, roles: ['student'] }],
      });
      const studentId = await createStudent(tenants, tenants.A, {
        dateOfBirth: birthDateYearsAgo(20),
        userId: user.userId,
      });

      const res = await http.get('/v1/me').set(bearer(session)).expect(StatusCodes.OK);

      expect(res.body.active).toMatchObject({ roles: ['student'], studentId });
      expect(res.body.active.grants).toContain('theory.use');
    });

    it('works without a school in the token', async () => {
      const { session } = await login({ platformAdmin: true });

      const res = await http.get('/v1/me').set(bearer(session)).expect(StatusCodes.OK);

      expect(res.body.memberships).toEqual([]);
      expect(res.body.active).toBeNull();
    });
  });

  describe('POST /v1/me/switch-school', () => {
    it('binds a new session to one of the caller’s active memberships', async () => {
      const { user, session } = await login({
        memberships: [
          { tenant: tenants.A, roles: ['instructor'] },
          { tenant: tenants.B, roles: ['student'] },
        ],
      });

      const res = await http
        .post('/v1/me/switch-school')
        .set(bearer(session))
        .send({ membershipId: user.membershipIds[1], client: 'mobile' })
        .expect(StatusCodes.OK);

      expect(res.body.activeMembershipId).toBe(user.membershipIds[1]);
      expect(decodeClaims(res.body.accessToken)).toMatchObject({
        mid: user.membershipIds[1],
        sid: tenants.B.schoolId,
        roles: ['student'],
      });
      const me = await http.get('/v1/me').set(bearer(res.body)).expect(StatusCodes.OK);
      expect(me.body.active).toEqual({
        membershipId: user.membershipIds[1],
        schoolId: tenants.B.schoolId,
        roles: ['student'],
        grants: expect.arrayContaining(['theory.use']),
        studentId: null,
        features: [],
      });
      await refresh(res.body.refreshToken).expect(StatusCodes.OK);
    });

    it("answers 404 for another user's membership or an inactive one", async () => {
      const { user, session } = await login({
        memberships: [
          { tenant: tenants.A, roles: ['student'] },
          { tenant: tenants.B, roles: ['student'], status: 'pending_consent' },
        ],
      });

      const foreign = await http
        .post('/v1/me/switch-school')
        .set(bearer(session))
        .send({ membershipId: tenants.B.ownerMembershipId })
        .expect(StatusCodes.NOT_FOUND);
      await http
        .post('/v1/me/switch-school')
        .set(bearer(session))
        .send({ membershipId: user.membershipIds[1] })
        .expect(StatusCodes.NOT_FOUND);

      expect(foreign.text).not.toContain(tenants.B.ownerMembershipId);
      expect(foreign.text).not.toContain(tenants.B.schoolId);
    });
  });

  describe('POST /v1/devices', () => {
    const devicesFor = async (userId: string) =>
      (
        await system.query<{ id: string; platform: string; locale: string; push_token: string }>(
          `select id, platform, locale, push_token from devices where user_id = $1`,
          [userId],
        )
      ).rows;

    it('creates the caller’s device and updates it on the next call', async () => {
      const { user, session } = await login();
      const pushToken = `ExponentPushToken[${user.userId}]`;

      const created = await http
        .post('/v1/devices')
        .set(bearer(session))
        .send({ platform: 'ios', pushToken, locale: 'en' })
        .expect(StatusCodes.CREATED);
      const updated = await http
        .post('/v1/devices')
        .set(bearer(session))
        .send({ platform: 'android', pushToken, locale: 'de' })
        .expect(StatusCodes.CREATED);

      expect(created.body).toEqual({ id: expect.any(String) });
      expect(updated.body).toEqual(created.body);
      expect(await devicesFor(user.userId)).toEqual([
        { id: created.body.id, platform: 'android', locale: 'de', push_token: pushToken },
      ]);
    });

    it('moves a push token to the user who registers it, with a new device id', async () => {
      const first = await login();
      const second = await login();
      const pushToken = `ExponentPushToken[moved-${first.user.userId}]`;
      const original = await http
        .post('/v1/devices')
        .set(bearer(first.session))
        .send({ platform: 'ios', pushToken, locale: 'en' })
        .expect(StatusCodes.CREATED);

      const moved = await http
        .post('/v1/devices')
        .set(bearer(second.session))
        .send({ platform: 'ios', pushToken, locale: 'en' })
        .expect(StatusCodes.CREATED);

      expect(moved.body.id).not.toBe(original.body.id);
      expect(await devicesFor(first.user.userId)).toEqual([]);
      expect((await devicesFor(second.user.userId)).map((d) => d.id)).toEqual([moved.body.id]);
    });

    it('validates the platform', async () => {
      const { session } = await login();
      await http
        .post('/v1/devices')
        .set(bearer(session))
        .send({ platform: 'web', pushToken: 'x', locale: 'en' })
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('AuthGuard', () => {
    it.each([
      ['no Authorization header', {}],
      ['a garbage bearer token', { Authorization: 'Bearer garbage' }],
      ['a token signed with another secret', null],
    ])('answers 401 unauthenticated for %s', async (_label, headers) => {
      const forged = await new SignJWT({ mid: null, sid: null, roles: [], typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(tenants.A.ownerUserId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('another-secret-that-is-at-least-32-chars'));
      const res = await http
        .get('/v1/me')
        .set(headers ?? { Authorization: `Bearer ${forged}` })
        .expect(StatusCodes.UNAUTHORIZED);

      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('answers 401 token_expired for an expired access token', async () => {
      const expired = await new SignJWT({ mid: null, sid: null, roles: [], typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(tenants.A.ownerUserId)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
        .sign(
          new TextEncoder().encode(
            kernel.app.get(ConfigService).getOrThrow<string>('AUTH_JWT_SECRET'),
          ),
        );

      const res = await http
        .get('/v1/me')
        .set({ Authorization: `Bearer ${expired}` })
        .expect(StatusCodes.UNAUTHORIZED);

      expect(res.body.error.code).toBe('token_expired');
    });

    it('sets the tenant from the token: the dev headers cannot override a bearer token', async () => {
      const { user, session } = await login();

      const res = await http
        .get('/v1/me')
        .set({
          ...bearer(session),
          'X-Dev-User': tenants.B.ownerUserId,
          'X-Dev-School': tenants.B.schoolId,
        })
        .expect(StatusCodes.OK);

      expect(res.body.user.id).toBe(user.userId);
    });
  });
});
