import type { SessionResponse } from '@driveos/shared';
import { describe, expect, it, vi } from 'vitest';
import { createAuthFetch } from '../../src/lib/auth-fetch';
import { createAuthStore } from '../../src/lib/auth-store';
import { memoryStorage } from '../support/memory-storage';
import { StatusCodes } from 'http-status-codes';

const BASE = 'http://api.test';

function sessionWith(accessToken: string, refreshToken: string): SessionResponse {
  return { accessToken, refreshToken, expiresIn: 900, activeMembershipId: null, memberships: [] };
}

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type RefreshResult = SessionResponse | null | Error;

async function setup(options: { refresh?: RefreshResult } = {}) {
  const store = createAuthStore({ secure: memoryStorage(), storage: memoryStorage() });
  await store.setSession(sessionWith('old-access', 'refresh-1'));
  const seen: { auth: string | null; body: string }[] = [];
  const responder = vi.fn<(request: Request) => Response>();
  const fetchImpl = async (request: Request) => {
    seen.push({ auth: request.headers.get('authorization'), body: await request.clone().text() });
    return responder(request);
  };
  const refresh = vi.fn(async () => {
    const result =
      options.refresh === undefined ? sessionWith('new-access', 'refresh-2') : options.refresh;
    if (result instanceof Error) throw result;
    return result;
  });
  const onSessionExpired = vi.fn();
  const authFetch = createAuthFetch({ store, refresh, fetch: fetchImpl, onSessionExpired });
  return { store, seen, responder, refresh, onSessionExpired, authFetch };
}

describe('createAuthFetch', () => {
  it('attaches the bearer access token', async () => {
    const { authFetch, responder, seen } = await setup();
    responder.mockReturnValue(json(StatusCodes.OK));
    await authFetch(new Request(`${BASE}/v1/me`));
    expect(seen[0]?.auth).toBe('Bearer old-access');
  });

  it('refreshes once on 401 and retries with the new token and the same body', async () => {
    const { authFetch, responder, seen, refresh, store } = await setup();
    responder
      .mockReturnValueOnce(json(StatusCodes.UNAUTHORIZED))
      .mockReturnValueOnce(json(StatusCodes.CREATED, { id: 'x' }));
    const response = await authFetch(
      new Request(`${BASE}/v1/devices`, { method: 'POST', body: '{"platform":"ios"}' }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    expect(refresh).toHaveBeenCalledWith('refresh-1');
    expect(seen.map((call) => call.auth)).toEqual(['Bearer old-access', 'Bearer new-access']);
    expect(seen[1]?.body).toBe('{"platform":"ios"}');
    expect(store.getState().refreshToken).toBe('refresh-2');
  });

  it('does not retry a second time when the retried request is also 401', async () => {
    const { authFetch, responder, refresh, onSessionExpired } = await setup();
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('logs out when the server rejects the refresh token', async () => {
    const { authFetch, responder, store, onSessionExpired } = await setup({ refresh: null });
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(store.getState().status).toBe('signedOut');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('stays signed in when the refresh fails because the network is down', async () => {
    const { authFetch, responder, store, onSessionExpired } = await setup({
      refresh: new TypeError('Network request failed'),
    });
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(store.getState()).toMatchObject({ status: 'signedIn', refreshToken: 'refresh-1' });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('shares one refresh between concurrent 401s', async () => {
    const { authFetch, responder, refresh } = await setup();
    responder.mockImplementation((request) =>
      request.headers.get('authorization') === 'Bearer new-access'
        ? json(StatusCodes.OK)
        : json(StatusCodes.UNAUTHORIZED),
    );
    const results = await Promise.all([
      authFetch(new Request(`${BASE}/v1/me`)),
      authFetch(new Request(`${BASE}/v1/school`)),
    ]);
    expect(results.map((r) => r.status)).toEqual([StatusCodes.OK, StatusCodes.OK]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('retries with the current token when another request already refreshed it', async () => {
    const { authFetch, responder, refresh, store } = await setup();
    responder.mockImplementation((request) => {
      if (request.headers.get('authorization') === 'Bearer old-access') {
        void store.setSession(sessionWith('fresh-access', 'refresh-3'));
        return json(StatusCodes.UNAUTHORIZED);
      }
      return json(StatusCodes.OK);
    });
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.OK);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('never refreshes for the auth endpoints themselves', async () => {
    const { authFetch, responder, refresh } = await setup();
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    await authFetch(new Request(`${BASE}/v1/auth/verify`, { method: 'POST', body: '{}' }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('passes a 401 through without refreshing when signed out', async () => {
    const { authFetch, responder, refresh, store } = await setup();
    await store.clear();
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(refresh).not.toHaveBeenCalled();
  });
});
