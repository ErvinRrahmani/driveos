import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { AppServices } from './api';
import type { AuthState } from './auth-store';
import { permissionsForRoles } from './permissions';
import { PERSIST } from './query';
import { activeMembership } from './route-group';

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}

export function useAuthState(): AuthState {
  const { auth } = useServices();
  return useSyncExternalStore(auth.subscribe, auth.getState, auth.getState);
}

export function useActiveMembership() {
  return activeMembership(useAuthState());
}

export function usePermissions() {
  const membership = useActiveMembership();
  return permissionsForRoles(membership?.roles ?? []);
}

export function useMe() {
  const { api } = useServices();
  const { status } = useAuthState();
  return api.$api.useQuery('get', '/v1/me', {}, { meta: PERSIST, enabled: status === 'signedIn' });
}
