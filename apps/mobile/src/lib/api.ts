import { type ApiClient, createApiClient } from '@driveos/shared/client';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { createAuthFetch, type FetchFn } from './auth-fetch';
import { type AuthStore, createAuthStore } from './auth-store';
import { createDiary, type Diary } from './diary/diary';
import { type DiaryStore, MemoryDiaryStore } from './diary/store';
import { createPersistOptions, createQueryClient } from './query';
import type { KeyValueStorage } from './storage';
import { StatusCodes } from 'http-status-codes';

export interface AppServices {
  api: ApiClient;
  auth: AuthStore;
  queryClient: QueryClient;
  persist: ReturnType<typeof createPersistOptions>;
  diary: Diary;
  resetCache(): Promise<void>;
}

export interface CreateServicesOptions {
  baseUrl: string;
  secure: KeyValueStorage;
  storage: KeyValueStorage;
  fetch?: FetchFn;
  diaryStore?: DiaryStore;
  isOnline?: () => boolean;
}

export function createServices(options: CreateServicesOptions): AppServices {
  const send: FetchFn = options.fetch ?? ((request) => globalThis.fetch(request));
  const auth = createAuthStore({ secure: options.secure, storage: options.storage });
  const queryClient = createQueryClient();
  const persist = createPersistOptions(options.storage);
  let diary: Diary | null = null;
  const resetCache = async () => {
    queryClient.clear();
    await Promise.all([
      Promise.resolve(persist.persister.removeClient()).catch(() => undefined),
      diary?.reset().catch(() => undefined),
    ]);
  };
  const plain = createApiClient({ baseUrl: options.baseUrl, fetch: send });
  const authFetch = createAuthFetch({
    store: auth,
    fetch: send,
    refresh: async (refreshToken) => {
      const { data, response } = await plain.fetchClient.POST('/v1/auth/refresh', {
        body: { refreshToken },
      });
      if (data) return data;
      if (response.status >= StatusCodes.INTERNAL_SERVER_ERROR)
        throw new Error(`refresh failed with ${response.status}`);
      return null;
    },
    onSessionExpired: () => void resetCache(),
  });
  const api = createApiClient({ baseUrl: options.baseUrl, fetch: authFetch });
  diary = createDiary({
    api,
    store: options.diaryStore ?? new MemoryDiaryStore(),
    isOnline: options.isOnline ?? (() => onlineManager.isOnline()),
  });
  return { api, auth, queryClient, persist, diary, resetCache };
}
