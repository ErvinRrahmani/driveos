import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AccessTokenService } from '../../src/kernel/auth/access-token.js';

const SECRET = 'test-jwt-secret-at-least-32-characters-long';
const USER = '0192f000-0002-7000-8000-000000000002';
const SCHOOL = '0192f000-0001-7000-8000-000000000001';
const MEMBERSHIP = '0192f000-0003-7000-8000-000000000001';

describe('AccessTokenService', () => {
  const tokens = new AccessTokenService({ secret: SECRET, ttlSeconds: 900 });

  it('signs an HS256 access token that verifies back to the principal', async () => {
    const { token, expiresIn } = await tokens.sign({
      userId: USER,
      membershipId: MEMBERSHIP,
      schoolId: SCHOOL,
      roles: ['owner', 'instructor'],
    });

    expect(expiresIn).toBe(900);
    expect(token.split('.')).toHaveLength(3);
    expect(await tokens.verify(token)).toEqual({
      ok: true,
      principal: {
        userId: USER,
        membershipId: MEMBERSHIP,
        schoolId: SCHOOL,
        roles: ['owner', 'instructor'],
        tokenType: 'access',
        sessionId: null,
      },
    });
  });

  it('carries the claims sub, mid, sid, roles, typ, iat, exp and jti', async () => {
    const { token } = await tokens.sign({
      userId: USER,
      membershipId: null,
      schoolId: null,
      roles: ['platform_admin'],
    });
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8'));

    expect(claims).toEqual({
      sub: USER,
      mid: null,
      sid: null,
      roles: ['platform_admin'],
      typ: 'access',
      iat: expect.any(Number),
      exp: expect.any(Number),
      jti: expect.any(String),
    });
    expect(claims.exp - claims.iat).toBe(900);
  });

  it('supports read-only support tokens bound to a support session', async () => {
    const { token } = await tokens.sign({
      userId: USER,
      membershipId: null,
      schoolId: SCHOOL,
      roles: [],
      tokenType: 'support',
      sessionId: MEMBERSHIP,
    });

    expect(await tokens.verify(token)).toMatchObject({
      ok: true,
      principal: { tokenType: 'support', sessionId: MEMBERSHIP, schoolId: SCHOOL },
    });
  });

  it('lets a support token live only for the rest of its session', async () => {
    const { token, expiresIn } = await tokens.sign(
      {
        userId: USER,
        membershipId: null,
        schoolId: SCHOOL,
        roles: [],
        tokenType: 'support',
        sessionId: MEMBERSHIP,
      },
      { ttlSeconds: 1800 },
    );
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8'));
    expect(expiresIn).toBe(1800);
    expect(claims.exp - claims.iat).toBe(1800);
    expect(claims.support_session_id).toBe(MEMBERSHIP);
  });

  it('reports an expired token as expired', async () => {
    const short = new AccessTokenService({ secret: SECRET, ttlSeconds: 1 });
    const { token } = await short.sign({
      userId: USER,
      membershipId: null,
      schoolId: null,
      roles: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 2100));

    expect(await tokens.verify(token)).toEqual({ ok: false, reason: 'expired' });
  });

  it.each([
    ['garbage', async () => 'not-a-jwt'],
    [
      'another secret',
      async () =>
        (
          await new AccessTokenService({
            secret: 'another-secret-that-is-at-least-32-chars',
            ttlSeconds: 900,
          }).sign({ userId: USER, membershipId: null, schoolId: null, roles: [] })
        ).token,
    ],
    [
      'alg none',
      async () =>
        new UnsecuredJWT({ mid: null, sid: null, roles: [], typ: 'access' })
          .setSubject(USER)
          .setIssuedAt()
          .setExpirationTime('5m')
          .encode(),
    ],
    [
      'a refresh-like token without typ',
      async () =>
        new SignJWT({ mid: null, sid: null, roles: [] })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(USER)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(new TextEncoder().encode(SECRET)),
    ],
  ])('rejects %s as invalid', async (_label, make) => {
    expect(await tokens.verify(await make())).toEqual({ ok: false, reason: 'invalid' });
  });
});
