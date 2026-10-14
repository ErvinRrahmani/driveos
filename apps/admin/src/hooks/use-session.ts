import type { MeResponse } from '@driveos/shared';
import { createContext, useContext } from 'react';
import { hasPermission, type Permission } from '@/lib/permissions';

export interface SessionContextValue {
  me: MeResponse;
  schoolName: string;
  permissions: ReadonlySet<Permission>;
  /** Plan features of the active school (`GET /v1/me` → `active.features`). */
  features: ReadonlySet<string>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside the signed-in app shell');
  return session;
}

export function useCan(...anyOf: Permission[]): boolean {
  return hasPermission(useSession().permissions, anyOf);
}

export function useHasFeature(feature: string): boolean {
  return useSession().features.has(feature);
}
