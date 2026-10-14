import type { MembershipSummary, SessionResponse } from '@driveos/shared';

export const REFRESH_TOKEN_KEY = 'driveos.admin.refreshToken';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  activeMembershipId: string | null;
  memberships: MembershipSummary[];
}

export type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AuthStore {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  setSession(session: SessionResponse): void;
  clear(): void;
  isAuthenticated(): boolean;
}

export function createAuthStore(storage: TokenStorage | null): AuthStore {
  let state: AuthState = {
    accessToken: null,
    refreshToken: storage?.getItem(REFRESH_TOKEN_KEY) ?? null,
    activeMembershipId: null,
    memberships: [],
  };
  const listeners = new Set<() => void>();

  const update = (next: AuthState) => {
    state = next;
    if (next.refreshToken) storage?.setItem(REFRESH_TOKEN_KEY, next.refreshToken);
    else storage?.removeItem(REFRESH_TOKEN_KEY);
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSession(session) {
      update({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        activeMembershipId: session.activeMembershipId,
        memberships: session.memberships,
      });
    },
    clear() {
      update({ accessToken: null, refreshToken: null, activeMembershipId: null, memberships: [] });
    },
    isAuthenticated: () => state.accessToken !== null || state.refreshToken !== null,
  };
}

export function browserTokenStorage(): TokenStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
