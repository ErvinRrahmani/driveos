import type { LessonResponse, SyncOp, SyncOpType } from '@driveos/shared';
import { v7 as uuidv7 } from 'uuid';
import { foldLesson, targetLessonId } from './reducer';
import type { DiaryReader, DiaryStore, DiaryWriter } from './store';
import type { QueuedOp } from './types';

type OpOf<T extends SyncOpType> = Extract<SyncOp, { type: T }>;

export type OpInput = {
  [T in SyncOpType]: { type: T; payload: OpOf<T>['payload'] };
}[SyncOpType];

export interface QueueDeps {
  now?: () => Date;
  newId?: () => string;
}

const LESSON_OPS: ReadonlySet<SyncOpType> = new Set([
  'lesson.move',
  'lesson.cancel',
  'lesson.complete',
  'lesson.no_show',
]);

export const isVersionedLessonOp = (type: SyncOpType) => LESSON_OPS.has(type);

async function nextSeq(tx: DiaryWriter): Promise<number> {
  const ops = await tx.ops();
  return ops.reduce((max, item) => Math.max(max, item.seq), 0) + 1;
}

export async function currentLesson(
  tx: Pick<DiaryWriter, 'get' | 'ops'>,
  lessonId: string,
): Promise<LessonResponse | null> {
  const ops = (await tx.ops()).filter((item) => targetLessonId(item.op) === lessonId);
  return foldLesson(await tx.get('lesson', lessonId), ops);
}

async function enqueueIn(
  tx: DiaryWriter,
  input: OpInput,
  deps: QueueDeps,
  draft?: LessonResponse,
): Promise<QueuedOp> {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? uuidv7;
  let baseVersion: number | null = null;
  if (input.type === 'lesson.create' && !draft) throw new Error('draft_required');
  if (isVersionedLessonOp(input.type)) {
    const lesson = await currentLesson(tx, (input.payload as { lessonId: string }).lessonId);
    if (!lesson) throw new Error('lesson_not_found');
    baseVersion = lesson.version;
  }
  const queued: QueuedOp = {
    seq: await nextSeq(tx),
    op: { opId: newId(), clientAt: now().toISOString(), baseVersion, ...input } as SyncOp,
    state: 'pending',
    draft: input.type === 'lesson.create' ? (draft ?? null) : null,
    error: null,
    serverState: null,
  };
  await tx.putOp(queued);
  return queued;
}

export async function enqueue(
  store: DiaryStore,
  scope: string,
  input: OpInput,
  deps: QueueDeps = {},
  draft?: LessonResponse,
): Promise<QueuedOp> {
  return store.write(scope, (tx) => enqueueIn(tx, input, deps, draft));
}

export async function enqueueAll(
  store: DiaryStore,
  scope: string,
  build: (tx: DiaryReader) => Promise<readonly OpInput[]>,
  deps: QueueDeps = {},
): Promise<QueuedOp[]> {
  return store.write(scope, async (tx) => {
    const queued: QueuedOp[] = [];
    for (const input of await build(tx)) queued.push(await enqueueIn(tx, input, deps));
    return queued;
  });
}

async function conflictOf(tx: DiaryWriter, opId: string): Promise<QueuedOp | null> {
  const found = (await tx.ops()).find((item) => item.op.opId === opId);
  return found?.state === 'conflict' ? found : null;
}

export async function keepServer(store: DiaryStore, scope: string, opId: string): Promise<void> {
  await store.write(scope, async (tx) => {
    const conflict = await conflictOf(tx, opId);
    if (!conflict) return;
    await tx.removeOp(opId);
    const serverState = conflict.serverState;
    if (!serverState) return;
    const stored = await tx.get('lesson', serverState.id);
    if (!stored || stored.version <= serverState.version) await tx.put('lesson', serverState);
  });
}

export async function retryConflict(
  store: DiaryStore,
  scope: string,
  opId: string,
  deps: QueueDeps = {},
): Promise<QueuedOp | null> {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? uuidv7;
  return store.write(scope, async (tx) => {
    const conflict = await conflictOf(tx, opId);
    if (!conflict) return null;
    const baseVersion =
      conflict.op.baseVersion === null
        ? null
        : (conflict.serverState?.version ?? conflict.op.baseVersion);
    const retried: QueuedOp = {
      seq: await nextSeq(tx),
      op: { ...conflict.op, opId: newId(), clientAt: now().toISOString(), baseVersion } as SyncOp,
      state: 'pending',
      draft: conflict.draft,
      error: null,
      serverState: null,
    };
    await tx.removeOp(opId);
    await tx.putOp(retried);
    return retried;
  });
}
