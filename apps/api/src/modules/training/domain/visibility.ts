export const LESSON_LOOKBACK_DAYS = 90;

const DAY_MS = 86_400_000;

export interface Viewer {
  readsAll: boolean;
  roles: readonly string[];
  membershipId: string | null;
}

export interface StudentScope {
  all: boolean;
  asInstructor: boolean;
  asStudent: boolean;
  asParent: boolean;
}

export interface VisibilitySources {
  assigned: readonly string[];
  withLessons: readonly string[];
  self: readonly string[];
  linked: readonly string[];
}

export function studentScope(viewer: Viewer): StudentScope {
  if (viewer.readsAll) return { all: true, asInstructor: false, asStudent: false, asParent: false };
  return {
    all: false,
    asInstructor: viewer.roles.includes('instructor') && viewer.membershipId !== null,
    asStudent: viewer.roles.includes('student'),
    asParent: viewer.roles.includes('parent'),
  };
}

export function visibleStudentIds(
  scope: StudentScope,
  sources: VisibilitySources,
): 'all' | ReadonlySet<string> {
  if (scope.all) return 'all';
  return new Set([
    ...(scope.asInstructor ? [...sources.assigned, ...sources.withLessons] : []),
    ...(scope.asStudent ? sources.self : []),
    ...(scope.asParent ? sources.linked : []),
  ]);
}

export function lessonWindowStart(now: Date): Date {
  return new Date(now.getTime() - LESSON_LOOKBACK_DAYS * DAY_MS);
}
