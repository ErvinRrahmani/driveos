import { randomUUID } from 'node:crypto';
import { type LessonResponse, SYNC_OP_TYPES, type SyncOp, syncOpSchema } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import {
  appliedResult,
  isStale,
  rejectedResult,
  SYNC_OP_PERMISSIONS,
  serverStateLessonId,
} from '../../../src/modules/scheduling/domain/sync-ops.js';

const LESSON = randomUUID();
const OTHER = randomUUID();

function lessonOp(type: 'lesson.move' | 'lesson.cancel', baseVersion: number): SyncOp {
  return syncOpSchema.parse({
    opId: randomUUID(),
    clientAt: '2030-01-01T08:00:00.000Z',
    type,
    baseVersion,
    payload:
      type === 'lesson.move'
        ? { lessonId: LESSON, start: '2030-01-07T09:00:00.000Z' }
        : { lessonId: LESSON },
  });
}

const createOp = syncOpSchema.parse({
  opId: randomUUID(),
  clientAt: '2030-01-01T08:00:00.000Z',
  type: 'lesson.create',
  baseVersion: null,
  payload: {
    lessonId: LESSON,
    studentId: randomUUID(),
    lessonTypeId: randomUUID(),
    vehicleId: null,
    start: '2030-01-07T09:00:00.000Z',
  },
});

const noteOp = syncOpSchema.parse({
  opId: randomUUID(),
  clientAt: '2030-01-01T08:00:00.000Z',
  type: 'private_note.upsert',
  baseVersion: null,
  payload: { privateNoteId: randomUUID(), lessonId: LESSON, body: 'Note' },
});

const lesson = (id: string, version: number) => ({ id, version }) as LessonResponse;

describe('sync op rules', () => {
  it('maps every op type to the permissions of its HTTP route', () => {
    expect(Object.keys(SYNC_OP_PERMISSIONS).sort()).toEqual([...SYNC_OP_TYPES].sort());
    expect(SYNC_OP_PERMISSIONS['lesson.no_show']).toEqual([
      'lessons.complete',
      'lessons.complete.own',
    ]);
  });

  it('builds applied and rejected results in the response shape', () => {
    expect(appliedResult(LESSON, OTHER, 2)).toEqual({
      opId: LESSON,
      status: 'applied',
      id: OTHER,
      version: 2,
      error: null,
      serverState: null,
    });
    expect(rejectedResult(LESSON, { code: 'x', message: 'y' }, null)).toEqual({
      opId: LESSON,
      status: 'rejected',
      id: null,
      version: null,
      error: { code: 'x', message: 'y' },
      serverState: null,
    });
  });

  it('picks the lesson that explains a rejection', () => {
    const move = lessonOp('lesson.move', 1);
    expect(serverStateLessonId(move, { code: 'lesson_conflict', message: '' })).toBe(LESSON);
    expect(serverStateLessonId(move, { code: 'not_found', message: '' })).toBeNull();
    expect(serverStateLessonId(move, { code: 'forbidden', message: '' })).toBeNull();
    expect(
      serverStateLessonId(createOp, {
        code: 'lesson_conflict',
        message: '',
        details: { lessonId: OTHER },
      }),
    ).toBe(OTHER);
    expect(serverStateLessonId(createOp, { code: 'slot_unavailable', message: '' })).toBe(LESSON);
    expect(serverStateLessonId(noteOp, { code: 'validation_error', message: '' })).toBeNull();
  });

  it('treats a base version older than the server as stale', () => {
    const cancel = lessonOp('lesson.cancel', 2);
    expect(isStale(cancel, lesson(LESSON, 3))).toBe(true);
    expect(isStale(cancel, lesson(LESSON, 2))).toBe(false);
    expect(isStale(cancel, lesson(OTHER, 9))).toBe(false);
    expect(isStale(cancel, null)).toBe(false);
    expect(isStale(createOp, lesson(LESSON, 3))).toBe(false);
  });
});
