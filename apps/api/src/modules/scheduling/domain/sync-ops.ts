import type { LessonResponse, SyncOp, SyncOpResult, SyncOpType } from '@driveos/shared';
import type { Permission } from '../../identity/index.js';

export const SYNC_OP_PERMISSIONS: Readonly<Record<SyncOpType, readonly Permission[]>> = {
  'lesson.create': ['lessons.create', 'lessons.create.own'],
  'lesson.move': ['lessons.move', 'lessons.move.own'],
  'lesson.cancel': ['lessons.cancel', 'lessons.cancel.own'],
  'lesson.complete': ['lessons.complete', 'lessons.complete.own'],
  'lesson.no_show': ['lessons.complete', 'lessons.complete.own'],
  'progress.upsert': ['progress.write.own'],
  'private_note.upsert': ['private_notes.write.own'],
  'payment.cash': ['payments.cash.record'],
};

export interface SyncOpError {
  code: string;
  message: string;
  details?: unknown;
}

const HIDING_CODES: ReadonlySet<string> = new Set(['forbidden', 'not_found']);

export function appliedResult(opId: string, id: string, version: number): SyncOpResult {
  return { opId, status: 'applied', id, version, error: null, serverState: null };
}

export function rejectedResult(
  opId: string,
  error: Pick<SyncOpError, 'code' | 'message'>,
  serverState: LessonResponse | null,
): SyncOpResult {
  return {
    opId,
    status: 'rejected',
    id: null,
    version: null,
    error: { code: error.code, message: error.message },
    serverState,
  };
}

function lessonIdOf(op: SyncOp): string | null {
  return op.type.startsWith('lesson.') && 'lessonId' in op.payload ? op.payload.lessonId : null;
}

/** The lesson whose current state explains a rejection: the clashing one for a booking conflict. */
export function serverStateLessonId(op: SyncOp, error: SyncOpError): string | null {
  if (HIDING_CODES.has(error.code)) return null;
  if (op.type === 'lesson.create' && error.code === 'lesson_conflict') {
    const clashing = (error.details as { lessonId?: unknown } | undefined)?.lessonId;
    return typeof clashing === 'string' ? clashing : null;
  }
  return lessonIdOf(op);
}

/** A lesson op based on an older version than the server's is a version conflict, whatever else failed. */
export function isStale(op: SyncOp, serverState: LessonResponse | null): boolean {
  return (
    op.baseVersion !== null &&
    serverState !== null &&
    serverState.id === lessonIdOf(op) &&
    serverState.version > op.baseVersion
  );
}
