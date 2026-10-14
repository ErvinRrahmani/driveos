import type { LessonResponse, SyncOp } from '@driveos/shared';
import type { QueuedOp } from '../../src/lib/diary/types';

export const SCOPE_A = '0192f000-0003-7000-8000-000000000003';
export const SCOPE_B = '0192f000-0003-7000-8000-000000000004';
export const LESSON_ID = '0192f000-0101-7000-8000-000000000001';
export const STUDENT_ID = '0192f000-0007-7000-8000-000000000001';

export function lesson(overrides: Partial<LessonResponse> = {}): LessonResponse {
  return {
    id: LESSON_ID,
    studentId: STUDENT_ID,
    studentName: 'Stella Student',
    instructorMembershipId: SCOPE_A,
    instructorName: 'Ingo Instructor',
    vehicleId: '0192f000-0005-7000-8000-000000000001',
    vehiclePlate: 'B-DS 101',
    lessonTypeId: '0192f000-0006-7000-8000-000000000001',
    lessonTypeName: 'Standard lesson',
    lessonTypeKind: 'lesson',
    creditMinutes: 60,
    start: '2026-10-12T07:00:00.000Z',
    end: '2026-10-12T08:00:00.000Z',
    status: 'booked',
    pickupAddress: 'Friedrichstraße 100, 10117 Berlin',
    pickupLat: 52.52,
    pickupLng: 13.388,
    bookedVia: 'office',
    bookedByMembershipId: '0192f000-0003-7000-8000-000000000002',
    lateCancel: false,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    ...overrides,
  };
}

export function queued(op: SyncOp, overrides: Partial<QueuedOp> = {}): QueuedOp {
  return {
    seq: 1,
    op,
    state: 'pending',
    draft: null,
    error: null,
    serverState: null,
    ...overrides,
  };
}

let counter = 0;

export function sequentialIds(prefix = '0192f000-0300-7000-8000-'): () => string {
  return () => {
    counter += 1;
    return `${prefix}${counter.toString(16).padStart(12, '0')}`;
  };
}
