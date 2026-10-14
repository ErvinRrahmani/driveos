import { describe, expect, it } from 'vitest';
import { enqueue } from '../../src/lib/diary/queue';
import { MemoryDiaryStore } from '../../src/lib/diary/store';
import { diaryLesson, diaryLessons, diaryProgress, diaryStatus } from '../../src/lib/diary/view';
import { LESSON_ID, SCOPE_A, STUDENT_ID, lesson } from '../support/diary';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NOW = new Date('2026-10-12T06:30:00.000Z');
const DAY = { from: '2026-10-12T00:00:00.000Z', to: '2026-10-13T00:00:00.000Z' };

async function storeWithLesson(version = 1) {
  const store = new MemoryDiaryStore();
  await store.write(SCOPE_A, (tx) => tx.put('lesson', lesson({ version })));
  return store;
}

describe('enqueue', () => {
  it('queues a cancel with a UUIDv7 op id and the lesson version, and shows it cancelled', async () => {
    const store = await storeWithLesson(3);
    const queued = await enqueue(
      store,
      SCOPE_A,
      { type: 'lesson.cancel', payload: { lessonId: LESSON_ID } },
      { now: () => NOW },
    );
    expect(queued.op.opId).toMatch(UUID_V7);
    expect(queued.op).toMatchObject({ baseVersion: 3, clientAt: NOW.toISOString() });
    expect(queued.state).toBe('pending');

    const reader = store.read(SCOPE_A);
    expect(await reader.get('lesson', LESSON_ID)).toEqual(lesson({ version: 3 }));
    expect(await diaryLesson(reader, LESSON_ID)).toMatchObject({
      lesson: { status: 'cancelled', cancelledAt: NOW.toISOString() },
      sync: 'pending',
    });
    expect(await diaryStatus(reader)).toEqual({ pending: 1, conflicts: 0 });
  });

  it('gives every op its own id', async () => {
    const store = await storeWithLesson();
    const first = await enqueue(store, SCOPE_A, {
      type: 'lesson.complete',
      payload: { lessonId: LESSON_ID },
    });
    const second = await enqueue(store, SCOPE_A, {
      type: 'private_note.upsert',
      payload: {
        privateNoteId: '0192f000-0400-7000-8000-000000000001',
        lessonId: LESSON_ID,
        body: 'Needs work on roundabouts.',
      },
    });
    expect(first.op.opId).not.toBe(second.op.opId);
    expect(second.seq).toBeGreaterThan(first.seq);
  });

  it('chains lesson ops on the predicted version', async () => {
    const store = await storeWithLesson(2);
    const move = await enqueue(store, SCOPE_A, {
      type: 'lesson.move',
      payload: { lessonId: LESSON_ID, start: '2026-10-12T10:00:00.000Z' },
    });
    const complete = await enqueue(store, SCOPE_A, {
      type: 'lesson.complete',
      payload: { lessonId: LESSON_ID },
    });
    expect([move.op.baseVersion, complete.op.baseVersion]).toEqual([2, 3]);
    expect((await diaryLesson(store.read(SCOPE_A), LESSON_ID))?.lesson).toMatchObject({
      start: '2026-10-12T10:00:00.000Z',
      status: 'completed',
    });
  });

  it('refuses a lesson op for a lesson the diary does not have', async () => {
    const store = new MemoryDiaryStore();
    await expect(
      enqueue(store, SCOPE_A, { type: 'lesson.complete', payload: { lessonId: LESSON_ID } }),
    ).rejects.toThrow('lesson_not_found');
    expect(await store.read(SCOPE_A).ops()).toEqual([]);
  });

  it('shows a created lesson as a pending draft in the day', async () => {
    const store = new MemoryDiaryStore();
    const draft = lesson({ id: '0192f000-0101-7000-8000-0000000000aa', bookedVia: 'sync' });
    const queued = await enqueue(
      store,
      SCOPE_A,
      {
        type: 'lesson.create',
        payload: {
          lessonId: draft.id,
          studentId: STUDENT_ID,
          lessonTypeId: draft.lessonTypeId,
          vehicleId: draft.vehicleId,
          start: draft.start,
        },
      },
      {},
      draft,
    );
    expect(queued.op.baseVersion).toBeNull();
    expect(await diaryLessons(store.read(SCOPE_A), DAY)).toEqual([
      { lesson: draft, sync: 'pending' },
    ]);
  });

  it('requires a draft for lesson.create', async () => {
    const store = new MemoryDiaryStore();
    await expect(
      enqueue(store, SCOPE_A, {
        type: 'lesson.create',
        payload: {
          lessonId: LESSON_ID,
          studentId: STUDENT_ID,
          lessonTypeId: LESSON_ID,
          vehicleId: null,
          start: '2026-10-12T07:00:00.000Z',
        },
      }),
    ).rejects.toThrow('draft_required');
  });

  it('shows queued progress next to the synced entries of a lesson', async () => {
    const store = await storeWithLesson();
    await enqueue(store, SCOPE_A, {
      type: 'progress.upsert',
      payload: {
        progressEntryId: '0192f000-0500-7000-8000-000000000001',
        lessonId: LESSON_ID,
        syllabusItemId: '0192f000-000b-7000-8000-000000000001',
        level: 3,
        note: 'Good mirror checks',
      },
    });
    expect(await diaryProgress(store.read(SCOPE_A), LESSON_ID)).toEqual([
      {
        entry: {
          id: '0192f000-0500-7000-8000-000000000001',
          lessonId: LESSON_ID,
          studentId: STUDENT_ID,
          syllabusItemId: '0192f000-000b-7000-8000-000000000001',
          level: 3,
          note: 'Good mirror checks',
          version: 1,
        },
        sync: 'pending',
      },
    ]);
  });
});
