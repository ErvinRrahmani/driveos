import type {
  LessonResponse,
  SyncAvailability,
  SyncEntity,
  SyncOp,
  SyncProgressEntry,
  SyncStudent,
  Vehicle,
} from '@driveos/shared';

export type DiaryEntity = SyncEntity;

export interface DiaryEntityMap {
  lesson: LessonResponse;
  student: SyncStudent;
  vehicle: Vehicle;
  progress_entry: SyncProgressEntry;
  availability: SyncAvailability;
}

export type OpState = 'pending' | 'conflict';

export interface OpError {
  code: string;
  message: string;
}

export interface QueuedOp {
  seq: number;
  op: SyncOp;
  state: OpState;
  draft: LessonResponse | null;
  error: OpError | null;
  serverState: LessonResponse | null;
}

export type SyncBadge = 'synced' | 'pending' | 'conflict';

export function entityIdOf<E extends DiaryEntity>(entity: E, value: DiaryEntityMap[E]): string {
  if (entity === 'availability') return (value as SyncAvailability).instructorMembershipId;
  return (value as { id: string }).id;
}
