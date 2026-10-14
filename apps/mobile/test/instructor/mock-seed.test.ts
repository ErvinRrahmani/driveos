import { createMockApi } from '@driveos/shared/mocks';
import { describe, expect, it } from 'vitest';
import { DEMO_CONFLICT_LESSON, seedDiaryConflictDemo } from '../../src/mock-diary-seed';

const INGO_MEMBERSHIP = '0192f000-0003-7000-8000-000000000003';

describe('seedDiaryConflictDemo', () => {
  it('adds a lesson for Ingo that meets an office edit on the first sync op', () => {
    const mock = createMockApi({ seed: seedDiaryConflictDemo });
    const demo = mock.store.lessons.get(DEMO_CONFLICT_LESSON)?.value;
    expect(demo).toMatchObject({
      instructorMembershipId: INGO_MEMBERSHIP,
      status: 'booked',
      version: 1,
      start: '2026-10-12T10:00:00.000Z',
      end: '2026-10-12T11:00:00.000Z',
    });
    expect(demo?.studentName).not.toBe('');
    expect(mock.store.syncStaleLessons.has(DEMO_CONFLICT_LESSON)).toBe(true);
    mock.store.syncStaleLessons.clear();
    mock.reset();
    expect(mock.store.syncStaleLessons.has(DEMO_CONFLICT_LESSON)).toBe(true);
  });
});
