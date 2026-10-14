import {
  type SyncChange,
  type SyncOpResult,
  syncPullResponseSchema,
  syncPushResponseSchema,
  SYNC_PUSH_MAX_OPS,
} from '@driveos/shared';
import type { ApiClient } from '@driveos/shared/client';
import { applyOptimistic } from './reducer';
import type { DiaryStore, DiaryWriter } from './store';
import type { QueuedOp } from './types';
import { countOps } from './view';

export type DiarySyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface DiarySyncSnapshot {
  status: DiarySyncStatus;
  pending: number;
  conflicts: number;
  lastSyncedAt: string | null;
}

export interface DiarySync {
  sync(): Promise<void>;
  refresh(): Promise<void>;
  getSnapshot(): DiarySyncSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export interface DiarySyncOptions {
  api: ApiClient;
  store: DiaryStore;
  scope: string;
  isOnline?: () => boolean;
  batchSize?: number;
  pullLimit?: number;
  now?: () => Date;
  onDataChange?: () => void;
}

type Outcome = 'ok' | 'offline' | 'error';

const PULL_LIMIT = 200;
const MAX_PULL_PAGES = 1000;
const MAX_ROUNDS = 5;

async function applyResult(tx: DiaryWriter, queued: QueuedOp, result: SyncOpResult) {
  if (result.status === 'rejected') {
    await tx.putOp({
      ...queued,
      state: 'conflict',
      error: result.error ?? { code: 'rejected', message: '' },
      serverState: result.serverState,
    });
    return;
  }
  await tx.removeOp(queued.op.opId);
  const { op } = queued;
  const version = result.version;
  if (version === null) return;
  switch (op.type) {
    case 'lesson.create': {
      const id = result.id ?? op.payload.lessonId;
      if (queued.draft && !(await tx.get('lesson', id))) {
        await tx.put('lesson', { ...queued.draft, id, version });
      }
      return;
    }
    case 'lesson.move':
    case 'lesson.cancel':
    case 'lesson.complete':
    case 'lesson.no_show': {
      const stored = await tx.get('lesson', op.payload.lessonId);
      const next = stored && stored.version < version ? applyOptimistic(stored, queued) : null;
      if (next) await tx.put('lesson', { ...next, version });
      return;
    }
    case 'progress.upsert': {
      const id = result.id ?? op.payload.progressEntryId;
      const stored = await tx.get('progress_entry', id);
      if (stored && stored.version >= version) return;
      const studentId =
        stored?.studentId ?? (await tx.get('lesson', op.payload.lessonId))?.studentId;
      if (!studentId) return;
      if (id !== op.payload.progressEntryId) {
        await tx.remove('progress_entry', op.payload.progressEntryId);
      }
      const { lessonId, syllabusItemId, level, note } = op.payload;
      await tx.put('progress_entry', {
        id,
        lessonId,
        studentId,
        syllabusItemId,
        level,
        note,
        version,
      });
      return;
    }
    default:
      return;
  }
}

async function applyChange(tx: DiaryWriter, change: SyncChange) {
  if (change.op !== 'upsert') {
    await tx.remove(change.entity, change.entityId);
    return;
  }
  switch (change.entity) {
    case 'lesson': {
      const stored = await tx.get('lesson', change.data.id);
      if (!stored || stored.version <= change.data.version) await tx.put('lesson', change.data);
      return;
    }
    case 'progress_entry': {
      const stored = await tx.get('progress_entry', change.data.id);
      if (!stored || stored.version <= change.data.version) {
        await tx.put('progress_entry', change.data);
      }
      return;
    }
    case 'student':
      await tx.put('student', change.data);
      return;
    case 'vehicle':
      await tx.put('vehicle', change.data);
      return;
    case 'availability':
      await tx.put('availability', change.data);
      return;
  }
}

export function createDiarySync(options: DiarySyncOptions): DiarySync {
  const { api, store, scope } = options;
  const isOnline = options.isOnline ?? (() => true);
  const batchSize = Math.min(options.batchSize ?? SYNC_PUSH_MAX_OPS, SYNC_PUSH_MAX_OPS);
  const pullLimit = options.pullLimit ?? PULL_LIMIT;
  const now = options.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  let snapshot: DiarySyncSnapshot = {
    status: 'idle',
    pending: 0,
    conflicts: 0,
    lastSyncedAt: null,
  };
  let running: Promise<void> | null = null;
  let disposed = false;

  const update = (patch: Partial<DiarySyncSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };

  const dataChanged = () => {
    if (!disposed) options.onDataChange?.();
  };

  const counts = async () => countOps(await store.read(scope).ops());

  async function push(attempted: Set<string>): Promise<Outcome> {
    for (;;) {
      const batch = (await store.read(scope).ops())
        .filter((item) => item.state === 'pending' && !attempted.has(item.op.opId))
        .slice(0, batchSize);
      if (batch.length === 0) return 'ok';
      for (const item of batch) attempted.add(item.op.opId);
      let reply;
      try {
        reply = await api.fetchClient.POST('/v1/sync', {
          // openapi-typescript-helpers 0.1.0 `Writable` treats a key typed exactly `null` as readOnly
          // (`NonNullable<null>` is `never`) and drops it, so `baseVersion: null` ops need the cast.
          body: { ops: batch.map((item) => item.op) } as never,
        });
      } catch {
        return 'offline';
      }
      const parsed = syncPushResponseSchema.safeParse(reply.data);
      if (!parsed.success) return 'error';
      const results = new Map(parsed.data.results.map((result) => [result.opId, result]));
      if (disposed) return 'ok';
      await store.write(scope, async (tx) => {
        for (const item of batch) {
          const result = results.get(item.op.opId);
          if (result) await applyResult(tx, item, result);
        }
      });
      dataChanged();
    }
  }

  async function pull(): Promise<Outcome> {
    let cursor = await store.read(scope).cursor();
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      let reply;
      try {
        reply = await api.fetchClient.GET('/v1/sync', {
          params: { query: { ...(cursor === null ? {} : { cursor }), limit: pullLimit } },
        });
      } catch {
        return 'offline';
      }
      const parsed = syncPullResponseSchema.safeParse(reply.data);
      if (!parsed.success) return 'error';
      if (disposed) return 'ok';
      const { items, nextCursor, hasMore } = parsed.data;
      await store.write(scope, async (tx) => {
        for (const change of items) await applyChange(tx, change);
        await tx.setCursor(nextCursor);
      });
      if (items.length > 0) dataChanged();
      if (!hasMore || nextCursor === cursor) return 'ok';
      cursor = nextCursor;
    }
    return 'ok';
  }

  async function run(): Promise<void> {
    if (disposed) return;
    if (!isOnline()) {
      update({ status: 'offline', ...(await counts()) });
      return;
    }
    update({ status: 'syncing' });
    const attempted = new Set<string>();
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      let outcome = await push(attempted);
      if (outcome === 'ok') outcome = await pull();
      if (outcome !== 'ok') {
        update({ status: outcome, ...(await counts()) });
        return;
      }
      const fresh = (await store.read(scope).ops()).filter(
        (item) => item.state === 'pending' && !attempted.has(item.op.opId),
      );
      if (fresh.length === 0) break;
    }
    update({ status: 'idle', lastSyncedAt: now().toISOString(), ...(await counts()) });
  }

  return {
    sync() {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
    async refresh() {
      update(await counts());
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
