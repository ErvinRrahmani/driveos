import { useSyncExternalStore } from 'react';
import type { AuthState } from '@/lib/auth-store';
import { useServices } from './use-services';

export function useAuthState(): AuthState {
  const { auth } = useServices();
  return useSyncExternalStore(auth.subscribe, auth.getState);
}
