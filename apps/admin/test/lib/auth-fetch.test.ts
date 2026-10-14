import type { SessionResponse } from '@driveos/shared';
import { describe, expect, it, vi } from 'vitest';
import { createAuthFetch } from '../../src/lib/auth-fetch';
import { createAuthStore, REFRESH_TOKEN_KEY } from '../../src/lib/auth-store';
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

function setup(
  options: {
    access?: string;
    refresh?: SessionResponse | null;
    restored?: boolean;
    refreshWhenTokenMissing?: boolean;
  } = {},
) {
  const storage = new Map<string, string>([[REFRESH_TOKEN_KEY, 'refresh-1']]);
  const store = createAuthStore({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, value),
    removeItem: (key) => void storage.delete(key),
  });
  if (!options.restored) store.setSession(sessionWith(options.access ?? 'old-access', 'refresh-1'));
  const seen: { url: string; auth: string | null; body: string }[] = [];
  const responder = vi.fn<(request: Request) => Response>();
  const fetchImpl = async (request: Request) => {
    seen.push({
      url: request.url,
      auth: request.headers.get('authorization'),
      body: await request.clone().text(),
    });
    return responder(request);
  };
  const refresh = vi.fn(async () =>
    options.refresh === undefined ? sessionWith('new-access', 'refresh-2') : options.refresh,
  );
  const onSessionExpired = vi.fn();
  const authFetch = createAuthFetch({
    store,
    refresh,
    fetch: fetchImpl,
    onSessionExpired,
    refreshWhenTokenMissing: options.refreshWhenTokenMissing ?? false,
  });
  return { store, seen, responder, refresh, onSessionExpired, authFetch };
}

describe('createAuthFetch', () => {
  it('attaches the bearer access token', async () => {
    const { authFetch, responder, seen } = setup();
    responder.mockReturnValue(json(StatusCodes.OK));
    await authFetch(new Request(`${BASE}/v1/me`));
    expect(seen[0]?.auth).toBe('Bearer old-access');
  });

  it('refreshes once on 401 and retries the request with the new token and the same body', async () => {
    const { authFetch, responder, seen, refresh, store } = setup();
    responder
      .mockReturnValueOnce(json(StatusCodes.UNAUTHORIZED))
      .mockReturnValueOnce(json(StatusCodes.CREATED, { id: 'x' }));
    const response = await authFetch(
      new Request(`${BASE}/v1/branches`, { method: 'POST', body: '{"name":"Mitte"}' }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    expect(refresh).toHaveBeenCalledWith('refresh-1');
    expect(seen.map((call) => call.auth)).toEqual(['Bearer old-access', 'Bearer new-access']);
    expect(seen[1]?.body).toBe('{"name":"Mitte"}');
    expect(store.getState().refreshToken).toBe('refresh-2');
  });

  it('does not retry a second time when the retried request is also 401', async () => {
    const { authFetch, responder, refresh, onSessionExpired } = setup();
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('logs out when the refresh fails', async () => {
    const { authFetch, responder, store, onSessionExpired } = setup({ refresh: null });
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(store.isAuthenticated()).toBe(false);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    const { authFetch, responder, refresh } = setup();
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
    const { authFetch, responder, refresh, store } = setup();
    responder.mockImplementation((request) => {
      if (request.headers.get('authorization') === 'Bearer old-access') {
        store.setSession(sessionWith('fresh-access', 'refresh-3'));
        return json(StatusCodes.UNAUTHORIZED);
      }
      return json(StatusCodes.OK);
    });
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.OK);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('never refreshes for the auth endpoints themselves', async () => {
    const { authFetch, responder, refresh } = setup();
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    await authFetch(new Request(`${BASE}/v1/auth/verify`, { method: 'POST', body: '{}' }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('passes a 401 through without refreshing when signed out', async () => {
    const { authFetch, responder, refresh, store } = setup();
    store.clear();
    responder.mockReturnValue(json(StatusCodes.UNAUTHORIZED));
    const response = await authFetch(new Request(`${BASE}/v1/me`));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(refresh).not.toHaveBeenCalled();
  });

  describe('after a reload (refresh token only)', () => {
    it('refreshes before the first request instead of sending it without a token', async () => {
      const { authFetch, responder, seen, refresh } = setup({
        restored: true,
        refreshWhenTokenMissing: true,
      });
      responder.mockReturnValue(json(StatusCodes.OK));
      const response = await authFetch(new Request(`${BASE}/v1/me`));
      expect(response.status).toBe(StatusCodes.OK);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(seen.map((call) => call.auth)).toEqual(['Bearer new-access']);
    });

    it('shares one proactive refresh between parallel requests', async () => {
      const { authFetch, responder, seen, refresh } = setup({
        restored: true,
        refreshWhenTokenMissing: true,
      });
      responder.mockImplementation(() => json(StatusCodes.OK));
      await Promise.all([
        authFetch(new Request(`${BASE}/v1/me`)),
        authFetch(new Request(`${BASE}/v1/school`)),
      ]);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(seen.map((call) => call.auth)).toEqual(['Bearer new-access', 'Bearer new-access']);
    });

    it('never refreshes proactively for the auth endpoints', async () => {
      const { authFetch, responder, refresh } = setup({
        restored: true,
        refreshWhenTokenMissing: true,
      });
      responder.mockReturnValue(json(StatusCodes.OK));
      await authFetch(new Request(`${BASE}/v1/auth/refresh`, { method: 'POST', body: '{}' }));
      expect(refresh).not.toHaveBeenCalled();
    });

    it('keeps the reactive behaviour when proactive refresh is off', async () => {
      const { authFetch, responder, seen, refresh } = setup({ restored: true });
      responder
        .mockReturnValueOnce(json(StatusCodes.UNAUTHORIZED))
        .mockReturnValueOnce(json(StatusCodes.OK));
      const response = await authFetch(new Request(`${BASE}/v1/me`));
      expect(response.status).toBe(StatusCodes.OK);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(seen.map((call) => call.auth)).toEqual([null, 'Bearer new-access']);
    });
  });
});
