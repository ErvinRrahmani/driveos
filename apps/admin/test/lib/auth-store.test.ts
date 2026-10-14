import type { SessionResponse } from '@driveos/shared';
import { describe, expect, it, vi } from 'vitest';
import { createAuthStore, REFRESH_TOKEN_KEY } from '../../src/lib/auth-store';

const session: SessionResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
  activeMembershipId: '0192f000-0003-7000-8000-000000000001',
  memberships: [
    {
      membershipId: '0192f000-0003-7000-8000-000000000001',
      schoolId: '0192f000-0001-7000-8000-000000000001',
      schoolName: 'Fahrschule Spree',
      roles: ['owner'],
      status: 'active',
    },
  ],
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

describe('auth store', () => {
  it('starts signed out with nothing stored', () => {
    const store = createAuthStore(memoryStorage());
    expect(store.getState().accessToken).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('keeps the access token in memory and the refresh token in storage', () => {
    const storage = memoryStorage();
    const store = createAuthStore(storage);
    store.setSession(session);
    expect(store.getState().accessToken).toBe('access-1');
    expect(store.getState().activeMembershipId).toBe(session.activeMembershipId);
    expect(storage.data.get(REFRESH_TOKEN_KEY)).toBe('refresh-1');
    expect([...storage.data.values()]).not.toContain('access-1');
  });

  it('restores a signed-in state from a stored refresh token', () => {
    const store = createAuthStore(memoryStorage({ [REFRESH_TOKEN_KEY]: 'refresh-9' }));
    expect(store.getState().refreshToken).toBe('refresh-9');
    expect(store.getState().accessToken).toBeNull();
    expect(store.isAuthenticated()).toBe(true);
  });

  it('notifies subscribers and forgets everything on clear', () => {
    const storage = memoryStorage();
    const store = createAuthStore(storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setSession(session);
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ accessToken: null, refreshToken: null });
    expect(storage.data.has(REFRESH_TOKEN_KEY)).toBe(false);
    unsubscribe();
    store.setSession(session);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
