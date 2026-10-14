import type { LessonResponse, SyncOp } from '@driveos/shared';
import type { QueuedOp } from './types';

export function targetLessonId(op: SyncOp): string | null {
  return 'lessonId' in op.payload ? op.payload.lessonId : null;
}

const bump = (lesson: LessonResponse) => lesson.version + 1;

export function applyOptimistic(
  lesson: LessonResponse | null,
  { op, draft }: Pick<QueuedOp, 'op' | 'draft'>,
): LessonResponse | null {
  if (op.type === 'lesson.create') return lesson ?? draft;
  if (!lesson) return null;
  switch (op.type) {
    case 'lesson.cancel':
      return {
        ...lesson,
        status: 'cancelled',
        cancelledAt: op.clientAt,
        cancelReason: op.payload.reason ?? null,
        version: bump(lesson),
      };
    case 'lesson.complete':
      return { ...lesson, status: 'completed', version: bump(lesson) };
    case 'lesson.no_show':
      return { ...lesson, status: 'no_show', version: bump(lesson) };
    case 'lesson.move': {
      const length = Date.parse(lesson.end) - Date.parse(lesson.start);
      const start = new Date(op.payload.start);
      const vehicleChanged =
        op.payload.vehicleId !== undefined && op.payload.vehicleId !== lesson.vehicleId;
      return {
        ...lesson,
        start: start.toISOString(),
        end: new Date(start.getTime() + length).toISOString(),
        ...(vehicleChanged ? { vehicleId: op.payload.vehicleId ?? null, vehiclePlate: null } : {}),
        ...(op.payload.lessonTypeId ? { lessonTypeId: op.payload.lessonTypeId } : {}),
        version: bump(lesson),
      };
    }
    default:
      return lesson;
  }
}

export function foldLesson(
  lesson: LessonResponse | null,
  ops: readonly QueuedOp[],
): LessonResponse | null {
  return [...ops].sort((a, b) => a.seq - b.seq).reduce(applyOptimistic, lesson);
}
