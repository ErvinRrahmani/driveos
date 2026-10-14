import { createMockApi, MOCK_LOGIN_CODE } from '@driveos/shared/mocks';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServices } from '../../src/lib/api';
import { chooseSchool, requestLoginCode, verifyLoginCode } from '../../src/lib/login-flow';
import { registerPush } from '../../src/lib/push';
import { memoryStorage } from '../support/memory-storage';
import { StatusCodes } from 'http-status-codes';

const STELLA = '+4915550000006';
const LISBON_SCHOOL = '0192f000-0001-7000-8000-000000000002';
const STELLA_USER = '0192f000-0002-7000-8000-000000000006';

const mock = createMockApi();
const server = setupServer(...mock.handlers);

function services() {
  return createServices({
    baseUrl: 'http://api.test',
    secure: memoryStorage(),
    storage: memoryStorage(),
    fetch: (request) => fetch(request),
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => mock.reset());
afterAll(() => server.close());

describe('login flow against the shared mocks', () => {
  it('signs a student in with the one-time code and routes to the student app', async () => {
    const app = services();
    await app.auth.restore();
    expect(await requestLoginCode(app, STELLA)).toEqual({ ok: true });
    const result = await verifyLoginCode(app, STELLA, MOCK_LOGIN_CODE);
    expect(result).toEqual({ ok: true, next: '/student' });
    expect(app.auth.getState().status).toBe('signedIn');
    const { data } = await app.api.fetchClient.GET('/v1/me');
    expect(data?.user.fullName).toBe('Stella Student');
  });

  it('rejects a wrong code with the server error code', async () => {
    const app = services();
    await app.auth.restore();
    const result = await verifyLoginCode(app, STELLA, '123456');
    expect(result).toMatchObject({ ok: false, code: 'invalid_code' });
    expect(app.auth.getState().status).toBe('signedOut');
  });

  it('routes each seeded role to its group', async () => {
    const cases = [
      ['ines.ferreira@example.com', '/instructor'],
      ['+4915550000004', '/instructor'],
      ['gustav.minor@example.com', '/parent'],
      ['otto.owner@example.com', '/staff-only'],
    ] as const;
    for (const [contact, next] of cases) {
      const app = services();
      expect(await verifyLoginCode(app, contact, MOCK_LOGIN_CODE)).toEqual({ ok: true, next });
    }
  });

  it('asks for a school when the user has several memberships, then switches', async () => {
    const lisbonMembership = '0192f000-0003-7000-8000-0000000000ff';
    mock.store.memberships.set(lisbonMembership, {
      id: lisbonMembership,
      userId: STELLA_USER,
      schoolId: LISBON_SCHOOL,
      roles: ['student'],
      status: 'active',
      branchIds: [],
      grants: [],
      version: 1,
    });
    const app = services();
    expect(await verifyLoginCode(app, STELLA, MOCK_LOGIN_CODE)).toEqual({
      ok: true,
      next: '/choose-school',
    });
    expect(await chooseSchool(app, lisbonMembership)).toEqual({ ok: true, next: '/student' });
    expect(app.auth.getState().activeMembershipId).toBe(lisbonMembership);
    const { data } = await app.api.fetchClient.GET('/v1/me');
    expect(data?.active?.schoolId).toBe(LISBON_SCHOOL);
  });

  it('logs out when the API forgets the session and the refresh fails', async () => {
    const app = services();
    await verifyLoginCode(app, STELLA, MOCK_LOGIN_CODE);
    mock.reset();
    const { response } = await app.api.fetchClient.GET('/v1/me');
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(app.auth.getState().status).toBe('signedOut');
  });

  it('registers a fake push token for the signed-in user', async () => {
    const app = services();
    await verifyLoginCode(app, STELLA, MOCK_LOGIN_CODE);
    const result = await registerPush({
      os: 'web',
      isDevice: true,
      userId: STELLA_USER,
      locale: 'en',
      requestPermission: async () => true,
      getExpoPushToken: async () => 'unused',
      register: async (body) => {
        const { response } = await app.api.fetchClient.POST('/v1/devices', { body });
        if (!response.ok) throw new Error(String(response.status));
      },
    });
    expect(result).toEqual({ status: 'registered', token: `dev-web-${STELLA_USER}`, fake: true });
  });
});
