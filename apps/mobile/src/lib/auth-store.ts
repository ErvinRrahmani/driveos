import {
  type MembershipSummary,
  membershipSummarySchema,
  type SessionResponse,
} from '@driveos/shared';
import { z } from 'zod';
import type { KeyValueStorage } from './storage';

export const REFRESH_TOKEN_KEY = 'driveos.refreshToken';
export const SESSION_KEY = 'driveos.session';

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  activeMembershipId: string | null;
  memberships: MembershipSummary[];
}

export interface AuthStore {
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  restore(): Promise<void>;
  setSession(session: SessionResponse): Promise<void>;
  clear(): Promise<void>;
}

export interface AuthStoreOptions {
  secure: KeyValueStorage;
  storage: KeyValueStorage;
}

const snapshotSchema = z.object({
  activeMembershipId: z.string().nullable(),
  memberships: z.array(membershipSummarySchema),
});

const SIGNED_OUT: AuthState = {
  status: 'signedOut',
  accessToken: null,
  refreshToken: null,
  activeMembershipId: null,
  memberships: [],
};

function parseSnapshot(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createAuthStore({ secure, storage }: AuthStoreOptions): AuthStore {
  let state: AuthState = { ...SIGNED_OUT, status: 'restoring' };
  const listeners = new Set<() => void>();

  const update = (next: AuthState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const wipe = async () => {
    await Promise.allSettled([
      secure.removeItem(REFRESH_TOKEN_KEY),
      storage.removeItem(SESSION_KEY),
    ]);
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore() {
      try {
        const [refreshToken, raw] = await Promise.all([
          secure.getItem(REFRESH_TOKEN_KEY),
          storage.getItem(SESSION_KEY),
        ]);
        const snapshot = parseSnapshot(raw);
        if (refreshToken && snapshot) {
          update({ status: 'signedIn', accessToken: null, refreshToken, ...snapshot });
          return;
        }
        if (refreshToken || raw) await wipe();
      } catch {
        await wipe();
      }
      update(SIGNED_OUT);
    },
    async setSession(session) {
      update({
        status: 'signedIn',
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        activeMembershipId: session.activeMembershipId,
        memberships: session.memberships,
      });
      const snapshot = {
        activeMembershipId: session.activeMembershipId,
        memberships: session.memberships,
      };
      await Promise.allSettled([
        secure.setItem(REFRESH_TOKEN_KEY, session.refreshToken),
        storage.setItem(SESSION_KEY, JSON.stringify(snapshot)),
      ]);
    },
    async clear() {
      update(SIGNED_OUT);
      await wipe();
    },
  };
}
