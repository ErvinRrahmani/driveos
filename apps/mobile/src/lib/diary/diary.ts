import type { LessonResponse } from '@driveos/shared';
import type { ApiClient } from '@driveos/shared/client';
import {
  enqueue,
  enqueueAll,
  keepServer,
  type OpInput,
  type QueueDeps,
  retryConflict,
} from './queue';
import type { DiaryReader, DiaryStore } from './store';
import { createDiarySync, type DiarySync } from './sync';
import type { QueuedOp } from './types';

export interface DiaryScope {
  readonly scope: string;
  readonly sync: DiarySync;
  reader(): DiaryReader;
  enqueue(input: OpInput, draft?: LessonResponse): Promise<QueuedOp>;
  enqueueAll(build: (reader: DiaryReader) => Promise<readonly OpInput[]>): Promise<QueuedOp[]>;
  keepServer(opId: string): Promise<void>;
  retry(opId: string): Promise<QueuedOp | null>;
  revision(): number;
  subscribeData(listener: () => void): () => void;
}

export interface Diary {
  readonly store: DiaryStore;
  forScope(scope: string): DiaryScope;
  reset(): Promise<void>;
}

export interface DiaryOptions extends QueueDeps {
  api: ApiClient;
  store: DiaryStore;
  isOnline: () => boolean;
}

function createScope(options: DiaryOptions, scope: string): DiaryScope {
  const { store, isOnline } = options;
  const listeners = new Set<() => void>();
  let revision = 0;
  const changed = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };
  const sync = createDiarySync({
    api: options.api,
    store,
    scope,
    isOnline,
    onDataChange: changed,
  });
  const afterLocalChange = async (push: boolean) => {
    changed();
    await sync.refresh();
    if (push && isOnline()) void sync.sync();
  };
  return {
    scope,
    sync,
    reader: () => store.read(scope),
    async enqueue(input, draft) {
      const queued = await enqueue(store, scope, input, options, draft);
      await afterLocalChange(true);
      return queued;
    },
    async enqueueAll(build) {
      const queued = await enqueueAll(store, scope, build, options);
      await afterLocalChange(queued.length > 0);
      return queued;
    },
    async keepServer(opId) {
      await keepServer(store, scope, opId);
      await afterLocalChange(false);
    },
    async retry(opId) {
      const retried = await retryConflict(store, scope, opId, options);
      await afterLocalChange(retried !== null);
      return retried;
    },
    revision: () => revision,
    subscribeData(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createDiary(options: DiaryOptions): Diary {
  const scopes = new Map<string, DiaryScope>();
  return {
    store: options.store,
    forScope(scope) {
      let diary = scopes.get(scope);
      if (!diary) {
        diary = createScope(options, scope);
        scopes.set(scope, diary);
      }
      return diary;
    },
    async reset() {
      for (const diary of scopes.values()) diary.sync.dispose();
      scopes.clear();
      await options.store.wipe();
    },
  };
}
