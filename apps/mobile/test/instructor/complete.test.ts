import type { ApiClient } from '@driveos/shared/client';
import type { SyncProgressEntry } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import {
  completeLesson,
  completionOps,
  readStartingProgress,
  startingProgress,
} from '../../src/lib/diary/complete';
import { createDiary } from '../../src/lib/diary/diary';
import { MemoryDiaryStore } from '../../src/lib/diary/store';
import { diaryLesson, diaryProgress } from '../../src/lib/diary/view';
import { LESSON_ID, lesson, SCOPE_A, sequentialIds, STUDENT_ID } from '../support/diary';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ITEM_A = '0192f000-0009-7000-8000-00000000000a';
const ITEM_B = '0192f000-0009-7000-8000-00000000000b';
const ITEM_C = '0192f000-0009-7000-8000-00000000000c';
const OLD_LESSON = '0192f000-0101-7000-8000-0000000000e1';
const OLDER_LESSON = '0192f000-0101-7000-8000-0000000000e2';
const EXISTING_ENTRY = '0192f000-0400-7000-8000-000000000001';

function entry(overrides: Partial<SyncProgressEntry>): SyncProgressEntry {
  return {
    id: EXISTING_ENTRY,
    lessonId: LESSON_ID,
    studentId: STUDENT_ID,
    syllabusItemId: ITEM_A,
    level: 2,
    note: '',
    version: 1,
    ...overrides,
  };
}

async function offlineDiary(version = 3) {
  const store = new MemoryDiaryStore();
  await store.write(SCOPE_A, (tx) => tx.put('lesson', lesson({ version })));
  const diary = createDiary({ api: {} as ApiClient, store, isOnline: () => false });
  return diary.forScope(SCOPE_A);
}

describe('completionOps', () => {
  it('builds progress upserts, then the private note, then the completion', () => {
    const newId = sequentialIds('0192f000-0500-7000-8000-');
    const ops = completionOps(
      {
        lessonId: LESSON_ID,
        progress: [
          { syllabusItemId: ITEM_A, level: 3, note: ' Smooth gear changes ' },
          { syllabusItemId: ITEM_B, level: 1, note: '' },
        ],
        privateNote: '  Nervous at roundabouts  ',
      },
      new Map([[ITEM_A, EXISTING_ENTRY]]),
      newId,
    );
    expect(ops.map((op) => op.type)).toEqual([
      'progress.upsert',
      'progress.upsert',
      'private_note.upsert',
      'lesson.complete',
    ]);
    expect(ops[0]).toEqual({
      type: 'progress.upsert',
      payload: {
        progressEntryId: EXISTING_ENTRY,
        lessonId: LESSON_ID,
        syllabusItemId: ITEM_A,
        level: 3,
        note: 'Smooth gear changes',
      },
    });
    expect(ops[1]).toMatchObject({
      payload: { syllabusItemId: ITEM_B, level: 1, note: '', lessonId: LESSON_ID },
    });
    expect(ops[1]?.payload).toHaveProperty('progressEntryId');
    expect((ops[1]?.payload as { progressEntryId: string }).progressEntryId).not.toBe(
      EXISTING_ENTRY,
    );
    expect(ops[2]).toMatchObject({
      type: 'private_note.upsert',
      payload: { lessonId: LESSON_ID, body: 'Nervous at roundabouts' },
    });
    expect(ops[3]).toEqual({ type: 'lesson.complete', payload: { lessonId: LESSON_ID } });
  });

  it('skips the private note when it is blank', () => {
    const ops = completionOps({ lessonId: LESSON_ID, progress: [], privateNote: '   ' }, new Map());
    expect(ops).toEqual([{ type: 'lesson.complete', payload: { lessonId: LESSON_ID } }]);
  });
});

describe('startingProgress', () => {
  it('prefers this lesson, then the most recent earlier lesson per syllabus item', () => {
    const start = startingProgress(LESSON_ID, [
      {
        entry: entry({ id: 'a-old', lessonId: OLD_LESSON, level: 4 }),
        lessonStart: '2026-10-05T07:00:00.000Z',
      },
      {
        entry: entry({ id: 'a-now', level: 2, note: 'Today' }),
        lessonStart: '2026-10-12T07:00:00.000Z',
      },
      {
        entry: entry({ id: 'b-older', lessonId: OLDER_LESSON, syllabusItemId: ITEM_B, level: 1 }),
        lessonStart: '2026-10-01T07:00:00.000Z',
      },
      {
        entry: entry({ id: 'b-old', lessonId: OLD_LESSON, syllabusItemId: ITEM_B, level: 3 }),
        lessonStart: '2026-10-05T07:00:00.000Z',
      },
      {
        entry: entry({ id: 'c-unknown', lessonId: OLDER_LESSON, syllabusItemId: ITEM_C, level: 5 }),
        lessonStart: null,
      },
    ]);
    expect(start.get(ITEM_A)).toEqual({ level: 2, note: 'Today', entryId: 'a-now' });
    expect(start.get(ITEM_B)).toEqual({ level: 3, note: '', entryId: null });
    expect(start.get(ITEM_C)).toEqual({ level: 5, note: '', entryId: null });
  });
});

describe('completeLesson (offline)', () => {
  it('queues progress, private note and completion in order and shows the lesson completed', async () => {
    const diary = await offlineDiary(3);
    await diary.enqueue({
      type: 'progress.upsert',
      payload: {
        progressEntryId: EXISTING_ENTRY,
        lessonId: LESSON_ID,
        syllabusItemId: ITEM_A,
        level: 2,
        note: '',
      },
    });
    await completeLesson(diary, {
      lessonId: LESSON_ID,
      progress: [
        { syllabusItemId: ITEM_A, level: 4, note: 'Confident' },
        { syllabusItemId: ITEM_B, level: 2, note: '' },
      ],
      privateNote: 'Talk to the office about extra lessons',
    });
    const ops = (await diary.reader().ops()).slice(1).map((item) => item.op);
    expect(ops.map((op) => [op.type, op.baseVersion])).toEqual([
      ['progress.upsert', null],
      ['progress.upsert', null],
      ['private_note.upsert', null],
      ['lesson.complete', 3],
    ]);
    for (const op of ops) expect(op.opId).toMatch(UUID_V7);
    expect(ops[0]?.payload).toMatchObject({ progressEntryId: EXISTING_ENTRY, level: 4 });
    expect((ops[1]?.payload as { progressEntryId: string }).progressEntryId).toMatch(UUID_V7);
    expect((ops[2]?.payload as { privateNoteId: string }).privateNoteId).toMatch(UUID_V7);

    expect(await diaryLesson(diary.reader(), LESSON_ID)).toMatchObject({
      lesson: { status: 'completed', version: 4 },
      sync: 'pending',
    });
    const progress = await diaryProgress(diary.reader(), LESSON_ID);
    expect(progress.map(({ entry: e, sync }) => [e.syllabusItemId, e.level, sync])).toEqual([
      [ITEM_A, 4, 'pending'],
      [ITEM_B, 2, 'pending'],
    ]);
    expect(diary.sync.getSnapshot()).toMatchObject({ pending: 5, conflicts: 0 });
  });

  it('refuses to complete a lesson that is no longer booked', async () => {
    const diary = await offlineDiary();
    await diary.enqueue({ type: 'lesson.no_show', payload: { lessonId: LESSON_ID } });
    await expect(
      completeLesson(diary, { lessonId: LESSON_ID, progress: [], privateNote: '' }),
    ).rejects.toThrow('lesson_not_booked');
    expect(await diary.reader().ops()).toHaveLength(1);
  });

  it('reads the starting point from the stored progress of the student', async () => {
    const scopeStore = new MemoryDiaryStore();
    await scopeStore.write(SCOPE_A, async (tx) => {
      await tx.put('lesson', lesson());
      await tx.put(
        'lesson',
        lesson({
          id: OLD_LESSON,
          start: '2026-10-05T07:00:00.000Z',
          end: '2026-10-05T08:00:00.000Z',
        }),
      );
      await tx.put('progress_entry', entry({ id: 'old-a', lessonId: OLD_LESSON, level: 3 }));
      await tx.put(
        'progress_entry',
        entry({
          id: 'other-student',
          lessonId: OLD_LESSON,
          studentId: OLDER_LESSON,
          syllabusItemId: ITEM_B,
          level: 5,
        }),
      );
    });
    const start = await readStartingProgress(scopeStore.read(SCOPE_A), LESSON_ID);
    expect(start?.get(ITEM_A)).toEqual({ level: 3, note: '', entryId: null });
    expect(start?.has(ITEM_B)).toBe(false);
  });
});
