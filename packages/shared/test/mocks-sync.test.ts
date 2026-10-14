import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type SessionResponse,
  type SyncOp,
  syncPullResponseSchema,
  type SyncPullResponse,
  syncPushResponseSchema,
  type SyncPushResponse,
} from '../src/dto/index.js';
import { createMockApi } from '../src/mocks/index.js';

const BASE = 'http://api.test';
const NOW = new Date('2026-10-08T08:00:00.000Z');
const api = createMockApi({ now: () => NOW });
const server = setupServer(...api.handlers);

const INGO = '+4915550000004';
const INES = 'ines.ferreira@example.com';
const FIXTURE_LESSON = '0192f000-0101-7000-8000-000000000001';
const STELLA_STUDENT = '0192f000-0007-7000-8000-000000000001';
const SAM_STUDENT = '0192f000-0007-7000-8000-000000000002';
const STANDARD_LESSON = '0192f000-0006-7000-8000-000000000001';
const NEW_LESSON = '0192f000-0101-7000-8000-0000000000aa';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => api.reset());

let opCounter = 0;
const opId = () => {
  opCounter += 1;
  return `0192f000-0300-7000-8000-${opCounter.toString(16).padStart(12, '0')}`;
};

async function login(contact = INGO): Promise<string> {
  const response = await fetch(`${BASE}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contact, code: '000000', client: 'mobile' }),
  });
  return ((await response.json()) as SessionResponse).accessToken;
}

async function pull(token: string, query = ''): Promise<SyncPullResponse> {
  const response = await fetch(`${BASE}/v1/sync${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return syncPullResponseSchema.parse(await response.json());
}

async function push(token: string, ops: SyncOp[]): Promise<SyncPushResponse> {
  const response = await fetch(`${BASE}/v1/sync`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ops }),
  });
  return syncPushResponseSchema.parse(await response.json());
}

const cancelOp = (baseVersion: number, id = opId()): SyncOp => ({
  opId: id,
  clientAt: NOW.toISOString(),
  baseVersion,
  type: 'lesson.cancel',
  payload: { lessonId: FIXTURE_LESSON },
});

const createOp = (start: string, studentId = SAM_STUDENT, lessonId = NEW_LESSON): SyncOp => ({
  opId: opId(),
  clientAt: NOW.toISOString(),
  baseVersion: null,
  type: 'lesson.create',
  payload: {
    lessonId,
    studentId,
    lessonTypeId: STANDARD_LESSON,
    vehicleId: null,
    start,
  },
});

describe('sync mocks', () => {
  it("pulls the instructor's lessons, assigned students and the school's vehicles", async () => {
    const token = await login();
    const page = await pull(token);
    expect(page.hasMore).toBe(false);
    const byEntity = (entity: string) => page.items.filter((item) => item.entity === entity);
    expect(byEntity('lesson').map((item) => item.entityId)).toEqual([FIXTURE_LESSON]);
    expect(byEntity('student').length).toBeGreaterThan(0);
    expect(byEntity('vehicle').length).toBeGreaterThan(0);
    expect(page.items.every((item) => item.op === 'upsert')).toBe(true);
    expect(page.nextCursor).toBe(page.items.at(-1)?.seq);

    expect(await pull(token, `?cursor=${page.nextCursor}`)).toEqual({
      items: [],
      nextCursor: page.nextCursor,
      hasMore: false,
    });
  });

  it('pages with limit', async () => {
    const token = await login();
    const first = await pull(token, '?limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const second = await pull(token, `?cursor=${first.nextCursor}&limit=2`);
    expect(second.items[0]?.seq).not.toBe(first.items[0]?.seq);
  });

  it('keeps another school out of the feed', async () => {
    const token = await login(INES);
    const page = await pull(token);
    expect(page.items.some((item) => item.entityId === FIXTURE_LESSON)).toBe(false);
  });

  it('applies a cancel, feeds the new version and replays the same op id', async () => {
    const token = await login();
    const { nextCursor } = await pull(token);
    const op = cancelOp(1);
    const [result] = (await push(token, [op])).results;
    expect(result).toEqual({
      opId: op.opId,
      status: 'applied',
      id: FIXTURE_LESSON,
      version: 2,
      error: null,
      serverState: null,
    });

    const changes = await pull(token, `?cursor=${nextCursor}`);
    expect(changes.items).toEqual([
      expect.objectContaining({
        entity: 'lesson',
        op: 'upsert',
        data: expect.objectContaining({ status: 'cancelled', version: 2 }),
      }),
    ]);

    expect((await push(token, [op])).results).toEqual([result]);
    expect((await pull(token, `?cursor=${changes.nextCursor}`)).items).toEqual([]);
  });

  it('rejects a stale base version with the server state', async () => {
    const token = await login();
    await push(token, [cancelOp(1)]);
    const [result] = (await push(token, [cancelOp(1)])).results;
    expect(result).toMatchObject({
      status: 'rejected',
      id: null,
      error: { code: 'version_conflict' },
      serverState: { id: FIXTURE_LESSON, status: 'cancelled', version: 2 },
    });
  });

  it('books a lesson with the client id and rejects a clash with the clashing lesson', async () => {
    const token = await login();
    const [booked] = (await push(token, [createOp('2026-10-13T09:00:00.000Z')])).results;
    expect(booked).toMatchObject({ status: 'applied', id: NEW_LESSON, version: 1 });
    expect(api.store.lessons.get(NEW_LESSON)?.value.bookedVia).toBe('sync');

    const [rejected] = (
      await push(token, [createOp('2026-10-12T07:30:00.000Z', STELLA_STUDENT, opId())])
    ).results;
    expect(rejected).toMatchObject({
      status: 'rejected',
      error: { code: 'lesson_conflict' },
      serverState: { id: FIXTURE_LESSON },
    });
  });

  it('applies progress and private notes for a known lesson only', async () => {
    const token = await login();
    const entry = '0192f000-0500-7000-8000-000000000001';
    const progress = (lessonId: string): SyncOp => ({
      opId: opId(),
      clientAt: NOW.toISOString(),
      baseVersion: null,
      type: 'progress.upsert',
      payload: {
        progressEntryId: entry,
        lessonId,
        syllabusItemId: '0192f000-000b-7000-8000-000000000001',
        level: 3,
        note: 'ok',
      },
    });
    const { results } = await push(token, [
      progress(FIXTURE_LESSON),
      progress(FIXTURE_LESSON),
      progress(NEW_LESSON),
    ]);
    expect(results.map((result) => [result.status, result.version])).toEqual([
      ['applied', 1],
      ['applied', 2],
      ['rejected', null],
    ]);
    expect(results[2]?.error?.code).toBe('not_found');
  });

  it('refuses an op id used by another membership', async () => {
    const op = cancelOp(1);
    await push(await login(), [op]);
    const [result] = (await push(await login(INES), [op])).results;
    expect(result).toMatchObject({ status: 'rejected', error: { code: 'op_id_reused' } });
  });
  it('simulates an office edit on a lesson marked stale, once, so the op meets a version conflict', async () => {
    api.store.syncStaleLessons.add(FIXTURE_LESSON);
    const token = await login();
    const { results } = await push(token, [cancelOp(1)]);
    expect(results[0]).toMatchObject({
      status: 'rejected',
      error: { code: 'version_conflict' },
      serverState: {
        id: FIXTURE_LESSON,
        version: 2,
        status: 'booked',
        start: '2026-10-12T07:30:00.000Z',
        end: '2026-10-12T08:30:00.000Z',
      },
    });
    expect(api.store.syncStaleLessons.has(FIXTURE_LESSON)).toBe(false);
    const retried = await push(token, [cancelOp(2)]);
    expect(retried.results[0]).toMatchObject({ status: 'applied', version: 3 });
    api.reset();
    expect(api.store.syncStaleLessons.size).toBe(0);
  });
});
