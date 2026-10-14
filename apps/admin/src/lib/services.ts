import { type ApiClient, createApiClient } from '@driveos/shared/client';
import { QueryClient } from '@tanstack/react-query';
import { createAuthFetch } from './auth-fetch';
import { type AuthStore, createAuthStore, type TokenStorage } from './auth-store';

export interface AppServices {
  api: ApiClient;
  auth: AuthStore;
  queryClient: QueryClient;
}

export interface CreateServicesOptions {
  baseUrl: string;
  storage: TokenStorage | null;
  refreshWhenTokenMissing?: boolean;
}

export function createServices({
  baseUrl,
  storage,
  refreshWhenTokenMissing = false,
}: CreateServicesOptions): AppServices {
  const auth = createAuthStore(storage);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
  });
  const plain = createApiClient({
    baseUrl,
    fetch: (request: Request) => globalThis.fetch(request),
  });
  const authFetch = createAuthFetch({
    store: auth,
    refresh: async (refreshToken) => {
      const { data } = await plain.fetchClient.POST('/v1/auth/refresh', {
        body: { refreshToken },
      });
      return data ?? null;
    },
    onSessionExpired: () => queryClient.clear(),
    refreshWhenTokenMissing,
  });
  const api = createApiClient({ baseUrl, fetch: authFetch });
  return { api, auth, queryClient };
}
