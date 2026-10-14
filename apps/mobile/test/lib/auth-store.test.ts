import type { SessionResponse } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import { createAuthStore, REFRESH_TOKEN_KEY, SESSION_KEY } from '../../src/lib/auth-store';
import type { KeyValueStorage } from '../../src/lib/storage';
import { memoryStorage } from '../support/memory-storage';

const session: SessionResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
  activeMembershipId: '0192f000-0003-7000-8000-000000000005',
  memberships: [
    {
      membershipId: '0192f000-0003-7000-8000-000000000005',
      schoolId: '0192f000-0001-7000-8000-000000000001',
      schoolName: 'Fahrschule Spree',
      roles: ['student'],
      status: 'active',
    },
  ],
};

function setup(secureInitial = {}, plainInitial = {}) {
  const secure = memoryStorage(secureInitial);
  const plain = memoryStorage(plainInitial);
  return { secure, plain, store: createAuthStore({ secure, storage: plain }) };
}

describe('createAuthStore', () => {
  it('starts in the restoring state', () => {
    expect(setup().store.getState().status).toBe('restoring');
  });

  it('restores to signed out when nothing is stored', async () => {
    const { store } = setup();
    await store.restore();
    expect(store.getState().status).toBe('signedOut');
  });

  it('keeps the refresh token in secure storage and never persists the access token', async () => {
    const { store, secure, plain } = setup();
    await store.setSession(session);
    expect(secure.data.get(REFRESH_TOKEN_KEY)).toBe('refresh-1');
    const stored = [...secure.data.values(), ...plain.data.values()].join('\n');
    expect(stored).not.toContain('access-1');
    expect(store.getState()).toMatchObject({ status: 'signedIn', accessToken: 'access-1' });
  });

  it('restores the refresh token and memberships without an access token', async () => {
    const first = setup();
    await first.store.setSession(session);
    const second = createAuthStore({ secure: first.secure, storage: first.plain });
    await second.restore();
    expect(second.getState()).toEqual({
      status: 'signedIn',
      accessToken: null,
      refreshToken: 'refresh-1',
      activeMembershipId: session.activeMembershipId,
      memberships: session.memberships,
    });
  });

  it('clears both storages on sign out', async () => {
    const { store, secure, plain } = setup();
    await store.setSession(session);
    await store.clear();
    expect(secure.data.size).toBe(0);
    expect(plain.data.size).toBe(0);
    expect(store.getState().status).toBe('signedOut');
  });

  it('signs out when the stored session snapshot is unreadable', async () => {
    const { store, secure } = setup({ [REFRESH_TOKEN_KEY]: 'refresh-1' }, { [SESSION_KEY]: '{' });
    await store.restore();
    expect(store.getState().status).toBe('signedOut');
    expect(secure.data.size).toBe(0);
  });

  it('signs out instead of crashing when secure storage fails', async () => {
    const broken: KeyValueStorage = {
      getItem: () => Promise.reject(new Error('keychain locked')),
      setItem: () => Promise.reject(new Error('keychain locked')),
      removeItem: () => Promise.reject(new Error('keychain locked')),
    };
    const store = createAuthStore({ secure: broken, storage: memoryStorage() });
    await store.restore();
    expect(store.getState().status).toBe('signedOut');
  });

  it('notifies subscribers on every change', async () => {
    const { store } = setup();
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getState().status));
    await store.restore();
    await store.setSession(session);
    unsubscribe();
    await store.clear();
    expect(seen).toEqual(['signedOut', 'signedIn']);
  });
});
