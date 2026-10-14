import type { SessionResponse } from '@driveos/shared';
import type { AuthStore } from './auth-store';
import { StatusCodes } from 'http-status-codes';

export type FetchFn = (request: Request) => Promise<Response>;

export interface AuthFetchOptions {
  store: AuthStore;
  refresh: (refreshToken: string) => Promise<SessionResponse | null>;
  fetch?: FetchFn;
  onSessionExpired?: () => void;
  refreshWhenTokenMissing?: boolean;
}

const AUTH_PATH = /\/v1\/auth\//;

function withToken(request: Request, token: string | null): Request {
  const next = new Request(request);
  if (token) next.headers.set('authorization', `Bearer ${token}`);
  return next;
}

export function createAuthFetch(options: AuthFetchOptions): FetchFn {
  const send: FetchFn = options.fetch ?? ((request) => globalThis.fetch(request));
  let pending: Promise<string | null> | null = null;

  const refreshOnce = (refreshToken: string): Promise<string | null> => {
    pending ??= options
      .refresh(refreshToken)
      .catch(() => null)
      .then((session) => {
        if (session) {
          options.store.setSession(session);
          return session.accessToken;
        }
        options.store.clear();
        options.onSessionExpired?.();
        return null;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };

  const tokenBeforeSend = async (request: Request): Promise<string | null> => {
    const { accessToken, refreshToken } = options.store.getState();
    if (
      accessToken ||
      !refreshToken ||
      !options.refreshWhenTokenMissing ||
      AUTH_PATH.test(new URL(request.url).pathname)
    )
      return accessToken;
    return refreshOnce(refreshToken);
  };

  return async (request) => {
    const retry = request.clone();
    const used = await tokenBeforeSend(request);
    const response = await send(withToken(request, used));
    if (
      response.status !== StatusCodes.UNAUTHORIZED ||
      AUTH_PATH.test(new URL(request.url).pathname)
    )
      return response;
    const { accessToken: current, refreshToken } = options.store.getState();
    if (current && current !== used) return send(withToken(retry, current));
    if (!refreshToken) return response;
    const accessToken = await refreshOnce(refreshToken);
    if (!accessToken) return response;
    return send(withToken(retry, accessToken));
  };
}
