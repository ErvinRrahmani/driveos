export type StudentScope = 'all' | ReadonlySet<string>;

export const INSTRUCTOR_LESSON_LOOKBACK_DAYS = 90;
const DAY_MS = 86_400_000;

export function instructorLessonWindowStart(now: Date): Date {
  return new Date(now.getTime() - INSTRUCTOR_LESSON_LOOKBACK_DAYS * DAY_MS);
}

export interface UploadOwnerInput {
  scope: StudentScope;
  ownStudentId: string | null;
  requested?: string;
}

export type UploadOwnerDecision =
  | { ok: true; ownerStudentId: string | null }
  | { ok: false; reason: 'forbidden' | 'student_required' };

export function resolveUploadOwner(input: UploadOwnerInput): UploadOwnerDecision {
  if (input.scope === 'all') return { ok: true, ownerStudentId: input.requested ?? null };
  const requested = input.requested ?? input.ownStudentId;
  if (requested === null) return { ok: false, reason: 'student_required' };
  return input.scope.has(requested)
    ? { ok: true, ownerStudentId: requested }
    : { ok: false, reason: 'forbidden' };
}

export function canSeeDocument(scope: StudentScope, ownerStudentId: string | null): boolean {
  if (scope === 'all') return true;
  return ownerStudentId !== null && scope.has(ownerStudentId);
}

export function storageKeyFor(schoolId: string, documentId: string): string {
  return `${schoolId}/${documentId}`;
}
