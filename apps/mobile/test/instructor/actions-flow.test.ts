import type { SyncPushRequest } from '@driveos/shared';
import { createMockApi, MOCK_LOGIN_CODE } from '@driveos/shared/mocks';
import { getResponse, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServices } from '../../src/lib/api';
import { verifyLoginCode } from '../../src/lib/login-flow';
import { cashItems, cashOp } from '../../src/lib/diary/cash';
import { completeLesson } from '../../src/lib/diary/complete';
import { diaryConflicts, diaryLesson } from '../../src/lib/diary/view';
import { memoryStorage } from '../support/memory-storage';

const INGO = '+4915550000004';
const INGO_MEMBERSHIP = '0192f000-0003-7000-8000-000000000003';
const FIXTURE_LESSON = '0192f000-0101-7000-8000-000000000001';
const STELLA_STUDENT = '0192f000-0007-7000-8000-000000000001';
const ITEM_A = '0192f000-0009-7000-8000-00000000000a';
const ITEM_B = '0192f000-0009-7000-8000-00000000000b';

const mock = createMockApi({ now: () => new Date('2026-10-08T08:00:00.000Z') });
const server = setupServer(...mock.handlers);
let pushes: SyncPushRequest[] = [];

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  mock.reset();
  pushes = [];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function instructorDiary() {
  const app = createServices({
    baseUrl: 'http://api.test',
    secure: memoryStorage(),
    storage: memoryStorage(),
    fetch: async (request) => {
      if (request.method === 'POST' && new URL(request.url).pathname === '/v1/sync') {
        pushes.push((await request.clone().json()) as SyncPushRequest);
      }
      return fetch(request);
    },
    isOnline: () => true,
  });
  await app.auth.restore();
  const result = await verifyLoginCode(app, INGO, MOCK_LOGIN_CODE);
  if (!result.ok) throw new Error(result.code);
  const diary = app.diary.forScope(INGO_MEMBERSHIP);
  await diary.sync.sync();
  return { app, diary };
}

const pushedTypes = () => pushes.flatMap((request) => request.ops.map((op) => op.type));

describe('instructor lesson actions against the shared mocks', () => {
  it('completes a lesson with progress and a private note, sent in order', async () => {
    const { diary } = await instructorDiary();
    await completeLesson(diary, {
      lessonId: FIXTURE_LESSON,
      progress: [
        { syllabusItemId: ITEM_A, level: 3, note: 'Good mirror checks' },
        { syllabusItemId: ITEM_B, level: 2, note: '' },
      ],
      privateNote: 'Needs more motorway practice',
    });
    await diary.sync.sync();
    expect(pushedTypes()).toEqual([
      'progress.upsert',
      'progress.upsert',
      'private_note.upsert',
      'lesson.complete',
    ]);
    expect(pushes.flatMap((request) => request.ops).at(-1)).toMatchObject({ baseVersion: 1 });
    expect(await diaryLesson(diary.reader(), FIXTURE_LESSON)).toMatchObject({
      lesson: { status: 'completed', version: 2 },
      sync: 'synced',
    });
    expect(diary.sync.getSnapshot()).toMatchObject({ pending: 0, conflicts: 0 });
  });

  it('marks a no-show', async () => {
    const { diary } = await instructorDiary();
    await diary.enqueue({ type: 'lesson.no_show', payload: { lessonId: FIXTURE_LESSON } });
    await diary.sync.sync();
    expect(pushes.flatMap((request) => request.ops)).toMatchObject([
      { type: 'lesson.no_show', baseVersion: 1, payload: { lessonId: FIXTURE_LESSON } },
    ]);
    expect(await diaryLesson(diary.reader(), FIXTURE_LESSON)).toMatchObject({
      lesson: { status: 'no_show', version: 2 },
      sync: 'synced',
    });
    expect(mock.store.lessons.get(FIXTURE_LESSON)?.value.status).toBe('no_show');
  });

  it('records cash in minor units with the currency and survives a lost response', async () => {
    const { app, diary } = await instructorDiary();
    const { data } = await app.api.fetchClient.GET('/v1/price-items', {
      params: { query: { active: 'true', limit: 100 } },
    });
    const items = cashItems(data?.items ?? []);
    const item = items[0];
    if (!item) throw new Error('no payable price item');
    expect(items.every((candidate) => candidate.active && candidate.amountMinor > 0)).toBe(true);

    const input = cashOp(STELLA_STUDENT, item);
    expect(input).toEqual({
      type: 'payment.cash',
      payload: {
        paymentId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        studentId: STELLA_STUDENT,
        priceItemId: item.id,
        amountMinor: item.amountMinor,
        currency: item.currency,
      },
    });
    expect(Number.isInteger(input.payload.amountMinor)).toBe(true);

    server.use(
      http.post(
        '*/v1/sync',
        async ({ request }) => {
          await getResponse(mock.handlers, request);
          return HttpResponse.error();
        },
        { once: true },
      ),
    );
    const queued = await diary.enqueue(input);
    await diary.sync.sync();
    expect(diary.sync.getSnapshot()).toMatchObject({ pending: 1 });
    expect(mock.store.syncOperations.has(queued.op.opId)).toBe(true);

    await diary.sync.sync();
    expect(diary.sync.getSnapshot()).toMatchObject({ status: 'idle', pending: 0, conflicts: 0 });
    const sent = pushes.flatMap((request) => request.ops);
    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sent.map((op) => op.opId))).toEqual(new Set([queued.op.opId]));
    expect(new Set(sent.map((op) => JSON.stringify(op.payload)))).toEqual(
      new Set([JSON.stringify(input.payload)]),
    );
    expect(mock.store.syncOperations.size).toBe(1);
  });

  describe('a completion that meets an office edit', () => {
    async function conflicted() {
      const { diary } = await instructorDiary();
      mock.store.syncStaleLessons.add(FIXTURE_LESSON);
      await completeLesson(diary, {
        lessonId: FIXTURE_LESSON,
        progress: [{ syllabusItemId: ITEM_A, level: 4, note: '' }],
        privateNote: '',
      });
      await diary.sync.sync();
      const [conflict, ...rest] = await diaryConflicts(diary.reader());
      expect(rest).toEqual([]);
      expect(conflict).toMatchObject({
        op: { type: 'lesson.complete', baseVersion: 1 },
        error: { code: 'version_conflict' },
        serverState: { id: FIXTURE_LESSON, version: 2, start: '2026-10-12T07:30:00.000Z' },
      });
      expect(diary.sync.getSnapshot()).toMatchObject({ pending: 0, conflicts: 1 });
      expect(await diaryLesson(diary.reader(), FIXTURE_LESSON)).toMatchObject({
        sync: 'conflict',
      });
      if (!conflict) throw new Error('no conflict');
      return { diary, conflict };
    }

    it('keeps the server state', async () => {
      const { diary, conflict } = await conflicted();
      await diary.keepServer(conflict.op.opId);
      expect(await diaryLesson(diary.reader(), FIXTURE_LESSON)).toMatchObject({
        lesson: { status: 'booked', version: 2, start: '2026-10-12T07:30:00.000Z' },
        sync: 'synced',
      });
      expect(await diary.reader().ops()).toEqual([]);
    });

    it('retries on top of the server version', async () => {
      const { diary, conflict } = await conflicted();
      const retried = await diary.retry(conflict.op.opId);
      expect(retried?.op).toMatchObject({ type: 'lesson.complete', baseVersion: 2 });
      expect(retried?.op.opId).not.toBe(conflict.op.opId);
      await diary.sync.sync();
      expect(await diaryLesson(diary.reader(), FIXTURE_LESSON)).toMatchObject({
        lesson: { status: 'completed', version: 3 },
        sync: 'synced',
      });
      expect(diary.sync.getSnapshot()).toMatchObject({ pending: 0, conflicts: 0 });
    });
  });
});
