import { createMockApi, MOCK_LOGIN_CODE } from '@driveos/shared/mocks';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServices } from '../../src/lib/api';
import { signOut, verifyLoginCode } from '../../src/lib/login-flow';
import { diaryLesson, diaryLessons } from '../../src/lib/diary/view';
import { memoryStorage } from '../support/memory-storage';

const INGO = '+4915550000004';
const INGO_MEMBERSHIP = '0192f000-0003-7000-8000-000000000003';
const FIXTURE_LESSON = '0192f000-0101-7000-8000-000000000001';
const SAM_STUDENT = '0192f000-0007-7000-8000-000000000002';
const STELLA_STUDENT = '0192f000-0007-7000-8000-000000000001';
const STANDARD_LESSON = '0192f000-0006-7000-8000-000000000001';
const WEEK = { from: '2026-10-12T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z' };

const mock = createMockApi({ now: () => new Date('2026-10-08T08:00:00.000Z') });
const server = setupServer(...mock.handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => mock.reset());
afterAll(() => server.close());

async function signedInInstructor() {
  const app = createServices({
    baseUrl: 'http://api.test',
    secure: memoryStorage(),
    storage: memoryStorage(),
    fetch: (request) => fetch(request),
    isOnline: () => true,
  });
  await app.auth.restore();
  const result = await verifyLoginCode(app, INGO, MOCK_LOGIN_CODE);
  if (!result.ok) throw new Error(result.code);
  return app;
}

describe('instructor diary against the shared mocks', () => {
  it('pulls the diary, cancels offline-first and syncs the result', async () => {
    const app = await signedInInstructor();
    const diary = app.diary.forScope(INGO_MEMBERSHIP);
    await diary.sync.sync();
    const reader = diary.reader();
    expect((await diaryLessons(reader, WEEK)).map((item) => item.lesson.id)).toEqual([
      FIXTURE_LESSON,
    ]);
    expect((await reader.list('student')).length).toBeGreaterThan(0);
    expect((await reader.list('vehicle')).length).toBeGreaterThan(0);

    await diary.enqueue({ type: 'lesson.cancel', payload: { lessonId: FIXTURE_LESSON } });
    await diary.sync.sync();
    expect(await diaryLesson(reader, FIXTURE_LESSON)).toMatchObject({
      lesson: { status: 'cancelled', version: 2 },
      sync: 'synced',
    });
    expect(diary.sync.getSnapshot()).toMatchObject({ status: 'idle', pending: 0, conflicts: 0 });
  });

  it('books a lesson offline and shows a clash as a conflict', async () => {
    const app = await signedInInstructor();
    const diary = app.diary.forScope(INGO_MEMBERSHIP);
    await diary.sync.sync();
    const fixture = (await diaryLesson(diary.reader(), FIXTURE_LESSON))?.lesson;
    if (!fixture) throw new Error('fixture lesson missing');
    const draft = (id: string, studentId: string, start: string) => ({
      ...fixture,
      id,
      studentId,
      start,
      end: new Date(Date.parse(start) + 3_600_000).toISOString(),
      bookedVia: 'sync' as const,
    });
    const ok = draft(
      '0192f000-0101-7000-8000-0000000000a1',
      SAM_STUDENT,
      '2026-10-13T09:00:00.000Z',
    );
    const clash = draft(
      '0192f000-0101-7000-8000-0000000000a2',
      STELLA_STUDENT,
      '2026-10-12T07:30:00.000Z',
    );
    for (const lesson of [ok, clash]) {
      await diary.enqueue(
        {
          type: 'lesson.create',
          payload: {
            lessonId: lesson.id,
            studentId: lesson.studentId,
            lessonTypeId: STANDARD_LESSON,
            vehicleId: null,
            start: lesson.start,
          },
        },
        lesson,
      );
    }
    await diary.sync.sync();
    const lessons = await diaryLessons(diary.reader(), WEEK);
    expect(lessons.map((item) => [item.lesson.id, item.sync])).toEqual([
      [FIXTURE_LESSON, 'synced'],
      [clash.id, 'conflict'],
      [ok.id, 'synced'],
    ]);
    const [conflict] = await diary.reader().ops();
    expect(conflict).toMatchObject({
      error: { code: 'lesson_conflict' },
      serverState: { id: FIXTURE_LESSON },
    });
    expect(diary.sync.getSnapshot()).toMatchObject({ pending: 0, conflicts: 1 });

    await diary.keepServer(conflict?.op.opId ?? '');
    expect((await diaryLessons(diary.reader(), WEEK)).map((item) => item.lesson.id)).toEqual([
      FIXTURE_LESSON,
      ok.id,
    ]);
    expect(diary.sync.getSnapshot()).toMatchObject({ conflicts: 0 });
  });

  it('wipes the diary on sign-out', async () => {
    const app = await signedInInstructor();
    const diary = app.diary.forScope(INGO_MEMBERSHIP);
    await diary.sync.sync();
    await signOut(app);
    const reader = app.diary.forScope(INGO_MEMBERSHIP).reader();
    expect(await reader.list('lesson')).toEqual([]);
    expect(await reader.cursor()).toBeNull();
  });
});
