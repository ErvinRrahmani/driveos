import type { ApiClient } from '@driveos/shared/client';
import { describe, expect, it } from 'vitest';
import { createDiary } from '../../src/lib/diary/diary';
import { MemoryDiaryStore } from '../../src/lib/diary/store';
import { unsyncedWarning } from '../../src/lib/diary/unsynced';
import { LESSON_ID, lesson, SCOPE_A } from '../support/diary';

describe('unsyncedWarning', () => {
  it('lets the user leave when everything is synced', () => {
    expect(unsyncedWarning({ pending: 0, conflicts: 0 })).toBeNull();
  });

  it('warns when changes are waiting or need a decision', () => {
    expect(unsyncedWarning({ pending: 2, conflicts: 0 })).toEqual({ count: 2 });
    expect(unsyncedWarning({ pending: 0, conflicts: 1 })).toEqual({ count: 1 });
    expect(unsyncedWarning({ pending: 1, conflicts: 2 })).toEqual({ count: 3 });
  });

  it('warns after an offline change is queued and stops warning once the diary is wiped', async () => {
    const store = new MemoryDiaryStore();
    await store.write(SCOPE_A, (tx) => tx.put('lesson', lesson()));
    const diary = createDiary({ api: {} as ApiClient, store, isOnline: () => false });
    const scope = diary.forScope(SCOPE_A);
    await scope.enqueue({ type: 'lesson.cancel', payload: { lessonId: LESSON_ID } });
    expect(unsyncedWarning(scope.sync.getSnapshot())).toEqual({ count: 1 });

    await diary.reset();
    const fresh = diary.forScope(SCOPE_A);
    await fresh.sync.refresh();
    expect(unsyncedWarning(fresh.sync.getSnapshot())).toBeNull();
  });
});
