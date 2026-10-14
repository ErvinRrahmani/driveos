import type {
  LessonResponse,
  SyncChange,
  SyncOp,
  SyncOpResult,
  SyncPullResponse,
} from '@driveos/shared';
import { createApiClient } from '@driveos/shared/client';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { enqueue, keepServer, retryConflict } from '../../src/lib/diary/queue';
import { MemoryDiaryStore } from '../../src/lib/diary/store';
import { createDiarySync } from '../../src/lib/diary/sync';
import { diaryLesson, diaryLessons } from '../../src/lib/diary/view';
import { LESSON_ID, SCOPE_A, STUDENT_ID, lesson } from '../support/diary';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';

const BASE = 'http://api.test';
const SYNC_URL = `${BASE}/v1/sync`;
const OTHER_LESSON = '0192f000-0101-7000-8000-000000000002';
const DRAFT_ID = '0192f000-0101-7000-8000-0000000000aa';
const DAY = { from: '2026-10-12T00:00:00.000Z', to: '2026-10-13T00:00:00.000Z' };

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createApiClient({ baseUrl: BASE, fetch: (request) => fetch(request) });

interface FakeServer {
  pushes: SyncOp[][];
  pulls: (string | null)[];
}

type PushReply = (
  ops: SyncOp[],
  attempt: number,
) => Response | SyncOpResult[] | Promise<SyncOpResult[]>;
type PullReply = (cursor: string | null, attempt: number) => Response | SyncPullResponse;

const EMPTY_PAGE = (cursor: string | null): SyncPullResponse => ({
  items: [],
  nextCursor: cursor ?? '0',
  hasMore: false,
});

function fakeServer(push: PushReply, pull: PullReply = EMPTY_PAGE): FakeServer {
  const state: FakeServer = { pushes: [], pulls: [] };
  server.use(
    http.post(SYNC_URL, async ({ request }) => {
      const { ops } = (await request.json()) as { ops: SyncOp[] };
      state.pushes.push(ops);
      const reply = await push(ops, state.pushes.length);
      return reply instanceof Response ? reply : HttpResponse.json({ results: reply });
    }),
    http.get(SYNC_URL, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      state.pulls.push(cursor);
      const reply = pull(cursor, state.pulls.length);
      return reply instanceof Response ? reply : HttpResponse.json(reply);
    }),
  );
  return state;
}

const applied = (op: SyncOp, id: string, version: number): SyncOpResult => ({
  opId: op.opId,
  status: 'applied',
  id,
  version,
  error: null,
  serverState: null,
});

const rejected = (
  op: SyncOp,
  code: string,
  serverState: LessonResponse | null = null,
): SyncOpResult => ({
  opId: op.opId,
  status: 'rejected',
  id: null,
  version: null,
  error: { code, message: `${code} message` },
  serverState,
});

const lessonIdOf = (op: SyncOp) => ('lessonId' in op.payload ? op.payload.lessonId : '');

async function setup(lessons: LessonResponse[] = [lesson()]) {
  const store = new MemoryDiaryStore();
  await store.write(SCOPE_A, async (tx) => {
    for (const item of lessons) await tx.put('lesson', item);
  });
  const sync = createDiarySync({ api, store, scope: SCOPE_A, isOnline: () => true });
  return { store, sync, reader: store.read(SCOPE_A) };
}

const cancel = { type: 'lesson.cancel', payload: { lessonId: LESSON_ID } } as const;

function createInput(start = '2026-10-12T07:00:00.000Z') {
  const draft = lesson({ id: DRAFT_ID, start, end: '2026-10-12T08:00:00.000Z', bookedVia: 'sync' });
  return {
    draft,
    input: {
      type: 'lesson.create',
      payload: {
        lessonId: DRAFT_ID,
        studentId: STUDENT_ID,
        lessonTypeId: draft.lessonTypeId,
        vehicleId: draft.vehicleId,
        start,
      },
    } as const,
  };
}

describe('queue replay', () => {
  it('keeps the ops after a network failure and resends the same op ids', async () => {
    const { store, sync, reader } = await setup([
      lesson(),
      lesson({ id: OTHER_LESSON, start: '2026-10-12T09:00:00.000Z' }),
    ]);
    await enqueue(store, SCOPE_A, cancel);
    await enqueue(store, SCOPE_A, { type: 'lesson.complete', payload: { lessonId: OTHER_LESSON } });
    const fake = fakeServer((ops, attempt) =>
      attempt === 1 ? HttpResponse.error() : ops.map((op) => applied(op, lessonIdOf(op), 2)),
    );

    await sync.sync();
    expect(sync.getSnapshot()).toMatchObject({ status: 'offline', pending: 2, conflicts: 0 });
    expect((await reader.ops()).map((item) => item.state)).toEqual(['pending', 'pending']);
    expect(fake.pulls).toEqual([]);

    await sync.sync();
    expect(fake.pushes).toHaveLength(2);
    expect(fake.pushes[1]?.map((op) => op.opId)).toEqual(fake.pushes[0]?.map((op) => op.opId));
    expect(fake.pushes[0]?.map((op) => op.type)).toEqual(['lesson.cancel', 'lesson.complete']);
    expect(sync.getSnapshot()).toMatchObject({ status: 'idle', pending: 0, conflicts: 0 });
    expect(await reader.get('lesson', LESSON_ID)).toMatchObject({
      status: 'cancelled',
      version: 2,
    });
    expect(fake.pulls).toEqual([null]);
  });

  it('keeps the ops on a 5xx and reports an error', async () => {
    const { store, sync, reader } = await setup();
    await enqueue(store, SCOPE_A, cancel);
    fakeServer(() =>
      HttpResponse.json(
        { error: { code: 'internal', message: ReasonPhrases.INTERNAL_SERVER_ERROR } },
        { status: StatusCodes.INTERNAL_SERVER_ERROR },
      ),
    );
    await sync.sync();
    expect(sync.getSnapshot()).toMatchObject({ status: 'error', pending: 1 });
    expect(await reader.ops()).toHaveLength(1);
  });

  it('applies a replayed create once: one lesson, version set once', async () => {
    const { store, sync, reader } = await setup([]);
    const { input, draft } = createInput();
    await enqueue(store, SCOPE_A, input, {}, draft);
    const serverLesson = { ...draft, bookedVia: 'sync' as const, version: 1 };
    const fake = fakeServer(
      (ops, attempt) =>
        attempt === 1 ? HttpResponse.error() : ops.map((op) => applied(op, DRAFT_ID, 1)),
      (cursor) =>
        cursor === null
          ? {
              items: [
                {
                  seq: '5',
                  entityId: DRAFT_ID,
                  at: '2026-10-12T06:31:00.000Z',
                  op: 'upsert',
                  entity: 'lesson',
                  data: serverLesson,
                },
              ],
              nextCursor: '5',
              hasMore: false,
            }
          : EMPTY_PAGE(cursor),
    );

    await sync.sync();
    await sync.sync();
    await sync.sync();
    expect(fake.pushes).toHaveLength(2);
    expect(fake.pushes[0]?.[0]?.opId).toBe(fake.pushes[1]?.[0]?.opId);
    expect(await reader.list('lesson')).toEqual([serverLesson]);
    expect(await diaryLessons(reader, DAY)).toEqual([{ lesson: serverLesson, sync: 'synced' }]);
  });

  it('never lowers a version with a late replayed result', async () => {
    const { store, sync, reader } = await setup();
    await enqueue(store, SCOPE_A, cancel);
    await store.write(SCOPE_A, (tx) =>
      tx.put('lesson', lesson({ status: 'cancelled', version: 4 })),
    );
    fakeServer((ops) => ops.map((op) => applied(op, LESSON_ID, 2)));
    await sync.sync();
    expect(await reader.get('lesson', LESSON_ID)).toMatchObject({ version: 4 });
  });

  it('runs one loop for overlapping sync calls', async () => {
    const { store, sync } = await setup();
    await enqueue(store, SCOPE_A, cancel);
    const fake = fakeServer((ops) => ops.map((op) => applied(op, LESSON_ID, 2)));
    await Promise.all([sync.sync(), sync.sync(), sync.sync()]);
    expect(fake.pushes).toHaveLength(1);
    expect(fake.pulls).toHaveLength(1);
  });

  it('pushes ops queued while a push is in flight before it stops', async () => {
    const { store, sync, reader } = await setup([
      lesson(),
      lesson({ id: OTHER_LESSON, start: '2026-10-12T09:00:00.000Z' }),
    ]);
    await enqueue(store, SCOPE_A, cancel);
    const fake = fakeServer(async (ops, attempt) => {
      if (attempt === 1) {
        await enqueue(store, SCOPE_A, {
          type: 'lesson.no_show',
          payload: { lessonId: OTHER_LESSON },
        });
      }
      return ops.map((op) => applied(op, lessonIdOf(op), 2));
    });
    await sync.sync();
    expect(fake.pushes.map((ops) => ops.map((op) => op.type))).toEqual([
      ['lesson.cancel'],
      ['lesson.no_show'],
    ]);
    expect(await reader.ops()).toEqual([]);
  });

  it('sends ops in batches and keeps their order', async () => {
    const { store, reader } = await setup();
    for (let index = 0; index < 5; index += 1) {
      await enqueue(store, SCOPE_A, {
        type: 'private_note.upsert',
        payload: {
          privateNoteId: '0192f000-0400-7000-8000-000000000001',
          lessonId: LESSON_ID,
          body: `note ${index}`,
        },
      });
    }
    const fake = fakeServer((ops) => ops.map((op) => applied(op, op.opId, 1)));
    const sync = createDiarySync({
      api,
      store,
      scope: SCOPE_A,
      isOnline: () => true,
      batchSize: 2,
    });
    await sync.sync();
    expect(fake.pushes.map((ops) => ops.length)).toEqual([2, 2, 1]);
    const bodies = fake.pushes.flat().map((op) => (op.payload as { body: string }).body);
    expect(bodies).toEqual(['note 0', 'note 1', 'note 2', 'note 3', 'note 4']);
    expect(await reader.ops()).toEqual([]);
  });

  it('does not call the server while offline', async () => {
    const store = new MemoryDiaryStore();
    await enqueue(store, SCOPE_A, {
      type: 'private_note.upsert',
      payload: {
        privateNoteId: '0192f000-0400-7000-8000-000000000001',
        lessonId: LESSON_ID,
        body: 'x',
      },
    });
    const fake = fakeServer(() => []);
    const sync = createDiarySync({ api, store, scope: SCOPE_A, isOnline: () => false });
    await sync.sync();
    expect(sync.getSnapshot()).toMatchObject({ status: 'offline', pending: 1 });
    expect(fake.pushes).toEqual([]);
  });
});

describe('conflict handling', () => {
  const movedByOffice = lesson({ start: '2026-10-12T11:00:00.000Z', version: 3 });

  async function conflicted() {
    const context = await setup();
    await enqueue(context.store, SCOPE_A, cancel);
    const fake = fakeServer((ops) =>
      ops.map((op) => rejected(op, 'version_conflict', movedByOffice)),
    );
    await context.sync.sync();
    return { ...context, fake };
  }

  it('moves a version_conflict to the conflicts and leaves the local lesson untouched', async () => {
    const { sync, reader } = await conflicted();
    expect(sync.getSnapshot()).toMatchObject({ status: 'idle', pending: 0, conflicts: 1 });
    const [conflict] = await reader.ops();
    expect(conflict).toMatchObject({
      state: 'conflict',
      error: { code: 'version_conflict', message: 'version_conflict message' },
      serverState: movedByOffice,
    });
    expect(await reader.get('lesson', LESSON_ID)).toEqual(lesson());
    expect(await diaryLesson(reader, LESSON_ID)).toMatchObject({
      lesson: { status: 'cancelled' },
      sync: 'conflict',
    });
  });

  it('does not resend a conflicted op', async () => {
    const { sync, fake } = await conflicted();
    await sync.sync();
    expect(fake.pushes).toHaveLength(1);
  });

  it('keep server writes the server state and drops the op', async () => {
    const { store, sync, reader } = await conflicted();
    const [conflict] = await reader.ops();
    await keepServer(store, SCOPE_A, conflict?.op.opId ?? '');
    await sync.refresh();
    expect(await reader.ops()).toEqual([]);
    expect(await reader.get('lesson', LESSON_ID)).toEqual(movedByOffice);
    expect(await diaryLesson(reader, LESSON_ID)).toEqual({ lesson: movedByOffice, sync: 'synced' });
    expect(sync.getSnapshot()).toMatchObject({ pending: 0, conflicts: 0 });
  });

  it('retry re-queues the op with the server version as baseVersion under a new op id', async () => {
    const { store, sync, reader } = await conflicted();
    const [conflict] = await reader.ops();
    const retried = await retryConflict(store, SCOPE_A, conflict?.op.opId ?? '');
    expect(retried).toMatchObject({ state: 'pending', error: null, serverState: null });
    expect(retried?.op).toMatchObject({ type: 'lesson.cancel', baseVersion: 3 });
    expect(retried?.op.opId).not.toBe(conflict?.op.opId);
    expect((await reader.ops()).map((item) => item.op.opId)).toEqual([retried?.op.opId]);

    const fake = fakeServer((ops) => ops.map((op) => applied(op, LESSON_ID, 4)));
    await sync.sync();
    expect(fake.pushes[0]?.[0]).toMatchObject({ opId: retried?.op.opId, baseVersion: 3 });
    expect(await reader.ops()).toEqual([]);
  });

  it('keeps a create draft marked conflicted on lesson_conflict', async () => {
    const { store, sync, reader } = await setup([]);
    const { input, draft } = createInput();
    await enqueue(store, SCOPE_A, input, {}, draft);
    const clash = lesson({ id: OTHER_LESSON, version: 2 });
    fakeServer((ops) => ops.map((op) => rejected(op, 'lesson_conflict', clash)));
    await sync.sync();

    expect(sync.getSnapshot()).toMatchObject({ pending: 0, conflicts: 1 });
    expect(await diaryLessons(reader, DAY)).toEqual([{ lesson: draft, sync: 'conflict' }]);
    expect(await reader.get('lesson', OTHER_LESSON)).toBeNull();

    const [conflict] = await reader.ops();
    await keepServer(store, SCOPE_A, conflict?.op.opId ?? '');
    expect(await diaryLessons(reader, DAY)).toEqual([{ lesson: clash, sync: 'synced' }]);
  });

  it('retries a create without a base version', async () => {
    const { store, sync, reader } = await setup([]);
    const { input, draft } = createInput();
    await enqueue(store, SCOPE_A, input, {}, draft);
    fakeServer((ops) => ops.map((op) => rejected(op, 'lesson_conflict', null)));
    await sync.sync();
    const [conflict] = await reader.ops();
    const retried = await retryConflict(store, SCOPE_A, conflict?.op.opId ?? '');
    expect(retried?.op).toMatchObject({ type: 'lesson.create', baseVersion: null });
    expect(retried?.draft).toEqual(draft);
  });

  it('lands any other rejection in the conflicts without a server state', async () => {
    const { store, sync, reader } = await setup();
    await enqueue(store, SCOPE_A, {
      type: 'payment.cash',
      payload: {
        paymentId: '0192f000-0600-7000-8000-000000000001',
        studentId: STUDENT_ID,
        priceItemId: '0192f000-000c-7000-8000-000000000001',
        amountMinor: 6500,
        currency: 'EUR',
      },
    });
    fakeServer((ops) => ops.map((op) => rejected(op, 'forbidden')));
    await sync.sync();
    expect(sync.getSnapshot()).toMatchObject({ conflicts: 1 });
    expect((await reader.ops())[0]).toMatchObject({ state: 'conflict', serverState: null });
  });
});

describe('pull', () => {
  const change = (seq: number, rest: Omit<SyncChange, 'seq' | 'at'>): SyncChange =>
    ({ seq: String(seq), at: '2026-10-12T06:00:00.000Z', ...rest }) as SyncChange;

  it('applies upserts, deletes and revokes and stores the cursor', async () => {
    const { sync, reader } = await setup([
      lesson(),
      lesson({ id: OTHER_LESSON, start: '2026-10-12T09:00:00.000Z' }),
    ]);
    const student = {
      id: STUDENT_ID,
      fullName: 'Stella Student',
      phone: null,
      licenceClass: 'B',
      area: 'Mitte',
      pickupAddress: null,
      pickupLat: null,
      pickupLng: null,
      isPrimary: true,
    } as const;
    const progress = {
      id: '0192f000-0500-7000-8000-000000000001',
      lessonId: LESSON_ID,
      studentId: STUDENT_ID,
      syllabusItemId: '0192f000-000b-7000-8000-000000000001',
      level: 2,
      note: '',
      version: 1,
    } as const;
    const fake = fakeServer(
      () => [],
      (cursor) =>
        cursor === null
          ? {
              items: [
                change(1, {
                  entityId: LESSON_ID,
                  op: 'upsert',
                  entity: 'lesson',
                  data: lesson({ status: 'completed', version: 2 }),
                }),
                change(2, { entityId: STUDENT_ID, op: 'upsert', entity: 'student', data: student }),
                change(3, {
                  entityId: progress.id,
                  op: 'upsert',
                  entity: 'progress_entry',
                  data: progress,
                }),
              ],
              nextCursor: '3',
              hasMore: true,
            }
          : {
              items: [
                change(4, { entityId: OTHER_LESSON, op: 'revoke', entity: 'lesson', data: null }),
                change(5, { entityId: STUDENT_ID, op: 'delete', entity: 'student', data: null }),
              ],
              nextCursor: '5',
              hasMore: false,
            },
    );

    await sync.sync();
    expect(fake.pulls).toEqual([null, '3']);
    expect(await reader.cursor()).toBe('5');
    expect(await reader.get('lesson', LESSON_ID)).toMatchObject({
      status: 'completed',
      version: 2,
    });
    expect(await reader.get('lesson', OTHER_LESSON)).toBeNull();
    expect(await reader.get('student', STUDENT_ID)).toBeNull();
    expect(await reader.get('progress_entry', progress.id)).toEqual(progress);

    await sync.sync();
    expect(fake.pulls).toEqual([null, '3', '5']);
  });

  it('advances the cursor only after a successful page', async () => {
    const { sync, reader } = await setup([]);
    fakeServer(
      () => [],
      (cursor) =>
        cursor === null
          ? {
              items: [
                change(1, {
                  entityId: LESSON_ID,
                  op: 'upsert',
                  entity: 'lesson',
                  data: lesson(),
                }),
              ],
              nextCursor: '1',
              hasMore: true,
            }
          : HttpResponse.error(),
    );
    await sync.sync();
    expect(await reader.cursor()).toBe('1');
    expect(await reader.get('lesson', LESSON_ID)).toEqual(lesson());
    expect(sync.getSnapshot().status).toBe('offline');
  });

  it('keeps the cursor when a page cannot be parsed', async () => {
    const { sync, reader } = await setup([]);
    fakeServer(
      () => [],
      () => HttpResponse.json({ items: [{ nonsense: true }], nextCursor: '9', hasMore: false }),
    );
    await sync.sync();
    expect(await reader.cursor()).toBeNull();
    expect(sync.getSnapshot().status).toBe('error');
  });

  it('keeps a pending change visible over a pulled lesson', async () => {
    const { store, reader } = await setup();
    await enqueue(store, SCOPE_A, cancel);
    fakeServer(
      () => HttpResponse.error(),
      () => EMPTY_PAGE(null),
    );
    await store.write(SCOPE_A, (tx) => tx.put('lesson', lesson({ pickupAddress: 'New street' })));
    expect(await diaryLesson(reader, LESSON_ID)).toMatchObject({
      lesson: { status: 'cancelled', pickupAddress: 'New street' },
      sync: 'pending',
    });
  });
});

describe('status', () => {
  it('notifies subscribers and counts pending ops after refresh', async () => {
    const { store, sync } = await setup();
    const seen: string[] = [];
    sync.subscribe(() => seen.push(sync.getSnapshot().status));
    await enqueue(store, SCOPE_A, cancel);
    await sync.refresh();
    expect(sync.getSnapshot()).toMatchObject({ status: 'idle', pending: 1 });
    fakeServer((ops) => ops.map((op) => applied(op, LESSON_ID, 2)));
    await sync.sync();
    expect(seen).toContain('syncing');
    expect(sync.getSnapshot()).toMatchObject({ status: 'idle', pending: 0 });
    expect(sync.getSnapshot().lastSyncedAt).not.toBeNull();
  });
});
