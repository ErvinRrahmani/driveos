import { onlineManager, type Query } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPersistOptions,
  createQueryClient,
  PERSIST,
  shouldPersistQuery,
} from '../../src/lib/query';
import { memoryStorage } from '../support/memory-storage';

function queryAt(client: ReturnType<typeof createQueryClient>, key: string): Query {
  const query = client.getQueryCache().find({ queryKey: [key] });
  if (!query) throw new Error(`no query ${key}`);
  return query;
}

describe('query persistence', () => {
  it('persists only successful queries marked for persistence', async () => {
    const client = createQueryClient();
    await client.prefetchQuery({ queryKey: ['me'], queryFn: async () => 'me', meta: PERSIST });
    await client.prefetchQuery({ queryKey: ['live'], queryFn: async () => 'live' });
    await client.prefetchQuery({
      queryKey: ['broken'],
      queryFn: () => Promise.reject(new Error('x')),
      meta: PERSIST,
    });
    expect(shouldPersistQuery(queryAt(client, 'me'))).toBe(true);
    expect(shouldPersistQuery(queryAt(client, 'live'))).toBe(false);
    expect(shouldPersistQuery(queryAt(client, 'broken'))).toBe(false);
  });

  it('restores persisted read-only queries into a fresh client', async () => {
    const storage = memoryStorage();
    const source = createQueryClient();
    await source.prefetchQuery({ queryKey: ['me'], queryFn: async () => 'Stella', meta: PERSIST });
    await source.prefetchQuery({ queryKey: ['live'], queryFn: async () => 'secret' });
    const options = createPersistOptions(storage, { throttleTime: 0 });
    await persistQueryClientSave({ queryClient: source, ...options });
    const target = createQueryClient();
    await persistQueryClientRestore({ queryClient: target, ...options });
    expect(target.getQueryData(['me'])).toBe('Stella');
    expect(target.getQueryData(['live'])).toBeUndefined();
  });
});

describe('createQueryClient', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('pauses queries while offline and resumes when back online', async () => {
    const client = createQueryClient();
    client.mount();
    onlineManager.setOnline(false);
    const pending = client.fetchQuery({ queryKey: ['me'], queryFn: async () => 'me' });
    await Promise.resolve();
    expect(queryAt(client, 'me').state.fetchStatus).toBe('paused');
    onlineManager.setOnline(true);
    expect(await pending).toBe('me');
    client.unmount();
  });
});
