import type { MockStore } from '@driveos/shared/mocks';

export const DEMO_CONFLICT_LESSON = '0192f000-0101-7000-8000-0000000000c1';
const FIXTURE_LESSON = '0192f000-0101-7000-8000-000000000001';
const SAM_STUDENT = '0192f000-0007-7000-8000-000000000002';
const DEMO_START = '2026-10-12T10:00:00.000Z';

export function seedDiaryConflictDemo(store: MockStore): void {
  const fixture = store.lessons.get(FIXTURE_LESSON);
  const sam = store.students.get(SAM_STUDENT)?.value;
  if (!fixture || !sam) return;
  const length = Date.parse(fixture.value.end) - Date.parse(fixture.value.start);
  store.lessons.set(DEMO_CONFLICT_LESSON, {
    schoolId: fixture.schoolId,
    version: 1,
    value: {
      ...fixture.value,
      id: DEMO_CONFLICT_LESSON,
      studentId: sam.id,
      studentName: sam.fullName,
      start: DEMO_START,
      end: new Date(Date.parse(DEMO_START) + length).toISOString(),
      version: 1,
    },
  });
  store.syncStaleLessons.add(DEMO_CONFLICT_LESSON);
}
