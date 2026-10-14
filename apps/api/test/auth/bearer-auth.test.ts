import { describe, expect, it } from 'vitest';
import { AccessTokenService } from '../../src/kernel/auth/access-token.js';
import { BearerAuthenticator } from '../../src/kernel/auth/bearer.authenticator.js';
import { ApiError } from '../../src/kernel/http/api-error.js';
import { StatusCodes } from 'http-status-codes';

const SECRET = 'test-jwt-secret-at-least-32-characters-long';
const USER = '0192f000-0002-7000-8000-000000000002';
const SCHOOL = '0192f000-0001-7000-8000-000000000001';

describe('BearerAuthenticator', () => {
  const tokens = new AccessTokenService({ secret: SECRET, ttlSeconds: 900 });
  const bearer = new BearerAuthenticator(tokens);

  it('returns no principal without an Authorization header', async () => {
    expect(await bearer.authenticate({ headers: {} })).toBeNull();
  });

  it('builds the principal from a valid bearer token', async () => {
    const { token } = await tokens.sign({
      userId: USER,
      membershipId: null,
      schoolId: SCHOOL,
      roles: ['owner'],
    });

    expect(await bearer.authenticate({ headers: { authorization: `Bearer ${token}` } })).toEqual({
      userId: USER,
      membershipId: null,
      schoolId: SCHOOL,
      roles: ['owner'],
      tokenType: 'access',
      sessionId: null,
    });
  });

  it.each(['Bearer garbage', 'Basic dXNlcjpwYXNz', 'Bearer', 'Bearer a.b.c'])(
    'rejects %j with 401 unauthenticated',
    async (authorization) => {
      await expect(bearer.authenticate({ headers: { authorization } })).rejects.toMatchObject({
        status: StatusCodes.UNAUTHORIZED,
        code: 'unauthenticated',
      });
    },
  );

  it('rejects an expired token with 401 token_expired', async () => {
    const short = new AccessTokenService({ secret: SECRET, ttlSeconds: 1 });
    const { token } = await short.sign({
      userId: USER,
      membershipId: null,
      schoolId: null,
      roles: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 2100));

    const error = await bearer
      .authenticate({ headers: { authorization: `Bearer ${token}` } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: StatusCodes.UNAUTHORIZED, code: 'token_expired' });
  });
});
