import { describe, expect, it } from 'vitest';
import { AccessTokenService } from '../../src/kernel/auth/access-token.js';
import { authenticatorsFor } from '../../src/kernel/auth/auth.module.js';
import { BearerAuthenticator } from '../../src/kernel/auth/bearer.authenticator.js';
import { DevHeaderAuthenticator } from '../../src/kernel/auth/dev-auth.authenticator.js';

const SCHOOL = '0192f000-0001-7000-8000-000000000001';
const USER = '0192f000-0002-7000-8000-000000000001';

function headers(values: Record<string, string>) {
  return {
    headers: Object.fromEntries(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v])),
  };
}

describe('dev header authenticator', () => {
  const dev = new DevHeaderAuthenticator();

  it('builds the principal from X-Dev-School and X-Dev-User', () => {
    expect(dev.authenticate(headers({ 'X-Dev-School': SCHOOL, 'X-Dev-User': USER }))).toEqual({
      userId: USER,
      schoolId: SCHOOL,
      membershipId: null,
      roles: [],
      tokenType: 'access',
      sessionId: null,
    });
  });

  it('treats an empty or missing X-Dev-School as no school', () => {
    expect(
      dev.authenticate(headers({ 'X-Dev-School': '', 'X-Dev-User': USER }))?.schoolId,
    ).toBeNull();
    expect(dev.authenticate(headers({ 'X-Dev-User': USER }))?.schoolId).toBeNull();
  });

  it('returns no principal without a valid X-Dev-User', () => {
    expect(dev.authenticate(headers({ 'X-Dev-School': SCHOOL }))).toBeNull();
    expect(dev.authenticate(headers({ 'X-Dev-School': SCHOOL, 'X-Dev-User': 'nope' }))).toBeNull();
  });

  it('takes the membership and comma-separated roles from X-Dev-Membership and X-Dev-Roles', () => {
    const membership = '0192f000-0003-7000-8000-000000000001';
    expect(
      dev.authenticate(
        headers({
          'X-Dev-School': SCHOOL,
          'X-Dev-User': USER,
          'X-Dev-Membership': membership,
          'X-Dev-Roles': 'owner, instructor',
        }),
      ),
    ).toEqual({
      userId: USER,
      schoolId: SCHOOL,
      membershipId: membership,
      roles: ['owner', 'instructor'],
      tokenType: 'access',
      sessionId: null,
    });
  });

  it('returns no principal for an unknown dev role or a malformed dev membership', () => {
    expect(
      dev.authenticate(headers({ 'X-Dev-User': USER, 'X-Dev-Roles': 'owner,wizard' })),
    ).toBeNull();
    expect(
      dev.authenticate(headers({ 'X-Dev-User': USER, 'X-Dev-Membership': 'nope' })),
    ).toBeNull();
  });

  it('returns no principal when X-Dev-School is not a uuid', () => {
    expect(
      dev.authenticate(headers({ 'X-Dev-School': "x' or 1=1", 'X-Dev-User': USER })),
    ).toBeNull();
  });
});

describe('authenticatorsFor', () => {
  const tokens = new AccessTokenService({
    secret: 'test-jwt-secret-at-least-32-characters-long',
    ttlSeconds: 900,
  });

  it('registers the bearer authenticator everywhere and the dev stub only in test', () => {
    expect(authenticatorsFor('test', tokens)).toEqual([
      expect.any(BearerAuthenticator),
      expect.any(DevHeaderAuthenticator),
    ]);
    expect(authenticatorsFor('development', tokens)).toEqual([expect.any(BearerAuthenticator)]);
    expect(authenticatorsFor('production', tokens)).toEqual([expect.any(BearerAuthenticator)]);
  });
});
