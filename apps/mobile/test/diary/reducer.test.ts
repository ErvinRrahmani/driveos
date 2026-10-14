import type { SyncOp } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import { applyOptimistic, foldLesson, targetLessonId } from '../../src/lib/diary/reducer';
import { LESSON_ID, lesson, queued } from '../support/diary';

const AT = '2026-10-12T06:30:00.000Z';
const OP_ID = '0192f000-0300-7000-8000-000000000001';

function lessonOp(
  type: 'lesson.cancel' | 'lesson.complete' | 'lesson.no_show',
  baseVersion = 1,
): SyncOp {
  return { opId: OP_ID, clientAt: AT, baseVersion, type, payload: { lessonId: LESSON_ID } };
}

describe('applyOptimistic', () => {
  it('marks a lesson cancelled with the client time and reason', () => {
    const op: SyncOp = {
      opId: OP_ID,
      clientAt: AT,
      baseVersion: 1,
      type: 'lesson.cancel',
      payload: { lessonId: LESSON_ID, reason: 'Student is ill' },
    };
    expect(applyOptimistic(lesson(), queued(op))).toEqual(
      lesson({ status: 'cancelled', cancelledAt: AT, cancelReason: 'Student is ill', version: 2 }),
    );
  });

  it('marks a lesson completed and predicts the next version', () => {
    expect(applyOptimistic(lesson({ version: 3 }), queued(lessonOp('lesson.complete', 3)))).toEqual(
      lesson({ status: 'completed', version: 4 }),
    );
  });

  it('marks a no-show', () => {
    expect(applyOptimistic(lesson(), queued(lessonOp('lesson.no_show')))?.status).toBe('no_show');
  });

  it('moves a lesson and keeps its length', () => {
    const op: SyncOp = {
      opId: OP_ID,
      clientAt: AT,
      baseVersion: 1,
      type: 'lesson.move',
      payload: { lessonId: LESSON_ID, start: '2026-10-13T09:30:00.000Z', vehicleId: null },
    };
    expect(applyOptimistic(lesson(), queued(op))).toMatchObject({
      start: '2026-10-13T09:30:00.000Z',
      end: '2026-10-13T10:30:00.000Z',
      vehicleId: null,
      vehiclePlate: null,
      version: 2,
    });
  });

  it('uses the draft for a lesson.create', () => {
    const draft = lesson({ id: '0192f000-0101-7000-8000-0000000000aa', bookedVia: 'sync' });
    const op: SyncOp = {
      opId: OP_ID,
      clientAt: AT,
      baseVersion: null,
      type: 'lesson.create',
      payload: {
        lessonId: draft.id,
        studentId: draft.studentId,
        lessonTypeId: draft.lessonTypeId,
        vehicleId: draft.vehicleId,
        start: draft.start,
      },
    };
    expect(applyOptimistic(null, queued(op, { draft }))).toEqual(draft);
  });

  it('leaves the lesson alone for non-lesson ops and for a missing lesson', () => {
    const op: SyncOp = {
      opId: OP_ID,
      clientAt: AT,
      baseVersion: null,
      type: 'private_note.upsert',
      payload: {
        privateNoteId: '0192f000-0400-7000-8000-000000000001',
        lessonId: LESSON_ID,
        body: 'x',
      },
    };
    const original = lesson();
    expect(applyOptimistic(original, queued(op))).toBe(original);
    expect(applyOptimistic(null, queued(lessonOp('lesson.cancel')))).toBeNull();
  });

  it('does not mutate the input lesson', () => {
    const original = lesson();
    applyOptimistic(original, queued(lessonOp('lesson.cancel')));
    expect(original.status).toBe('booked');
  });
});

describe('foldLesson and targetLessonId', () => {
  it('applies queued ops in order', () => {
    const ops = [
      queued(lessonOp('lesson.complete', 1), { seq: 2 }),
      queued(
        {
          opId: OP_ID,
          clientAt: AT,
          baseVersion: 1,
          type: 'lesson.move',
          payload: { lessonId: LESSON_ID, start: '2026-10-12T09:00:00.000Z' },
        },
        { seq: 1 },
      ),
    ];
    expect(foldLesson(lesson(), ops)).toMatchObject({
      start: '2026-10-12T09:00:00.000Z',
      status: 'completed',
      version: 3,
    });
  });

  it('finds the lesson an op is about', () => {
    expect(targetLessonId(lessonOp('lesson.cancel'))).toBe(LESSON_ID);
    expect(
      targetLessonId({
        opId: OP_ID,
        clientAt: AT,
        baseVersion: null,
        type: 'payment.cash',
        payload: {
          paymentId: OP_ID,
          studentId: OP_ID,
          priceItemId: OP_ID,
          amountMinor: 6500,
          currency: 'EUR',
        },
      }),
    ).toBeNull();
  });
});
