import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { type Query, QueryClient } from '@tanstack/react-query';
import type { KeyValueStorage } from './storage';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { persist?: boolean };
  }
}

export const PERSIST = { persist: true } as const;
export const QUERY_CACHE_KEY = 'driveos.queryCache';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const CACHE_BUSTER = 'v1';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, gcTime: CACHE_MAX_AGE, networkMode: 'online' },
      mutations: { networkMode: 'online' },
    },
  });
}

export function shouldPersistQuery(query: Query): boolean {
  return query.meta?.persist === true && query.state.status === 'success';
}

export function createPersistOptions(
  storage: KeyValueStorage,
  { throttleTime }: { throttleTime?: number } = {},
) {
  return {
    persister: createAsyncStoragePersister({ storage, key: QUERY_CACHE_KEY, throttleTime }),
    maxAge: CACHE_MAX_AGE,
    buster: CACHE_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
}
