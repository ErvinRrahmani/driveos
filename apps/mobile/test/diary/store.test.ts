import type { SyncOp } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import { type DiaryStore, MemoryDiaryStore, SqliteDiaryStore } from '../../src/lib/diary/store';
import { LESSON_ID, SCOPE_A, SCOPE_B, lesson, queued } from '../support/diary';
import { nodeSqliteDatabase } from '../support/node-sqlite';

const op = (n: number): SyncOp => ({
  opId: `0192f000-0300-7000-8000-${n.toString(16).padStart(12, '0')}`,
  clientAt: '2026-10-12T06:30:00.000Z',
  baseVersion: 1,
  type: 'lesson.complete',
  payload: { lessonId: LESSON_ID },
});

const stores: [string, () => DiaryStore][] = [
  ['MemoryDiaryStore', () => new MemoryDiaryStore()],
  ['SqliteDiaryStore', () => new SqliteDiaryStore(async () => nodeSqliteDatabase())],
];

describe.each(stores)('%s', (_name, create) => {
  it('stores, lists and removes entities', async () => {
    const store = create();
    await store.write(SCOPE_A, async (tx) => {
      await tx.put('lesson', lesson());
      await tx.put('vehicle', {
        id: '0192f000-0005-7000-8000-000000000001',
        branchId: '0192f000-0004-7000-8000-000000000001',
        plate: 'B-DS 101',
        makeModel: 'VW Golf',
        transmission: 'manual',
        licenceClass: 'B',
        active: true,
      });
      await tx.put('availability', {
        instructorMembershipId: SCOPE_A,
        items: [],
      });
    });
    const reader = store.read(SCOPE_A);
    expect(await reader.get('lesson', LESSON_ID)).toEqual(lesson());
    expect(await reader.get('availability', SCOPE_A)).toEqual({
      instructorMembershipId: SCOPE_A,
      items: [],
    });
    expect(await reader.list('vehicle')).toHaveLength(1);
    await store.write(SCOPE_A, (tx) => tx.remove('lesson', LESSON_ID));
    expect(await reader.get('lesson', LESSON_ID)).toBeNull();
  });

  it('lists lessons overlapping a time range in start order', async () => {
    const store = create();
    const early = lesson({
      id: '0192f000-0101-7000-8000-000000000002',
      start: '2026-10-12T05:30:00.000Z',
      end: '2026-10-12T06:30:00.000Z',
    });
    const late = lesson({
      id: '0192f000-0101-7000-8000-000000000003',
      start: '2026-10-13T07:00:00.000Z',
      end: '2026-10-13T08:00:00.000Z',
    });
    await store.write(SCOPE_A, async (tx) => {
      await tx.put('lesson', late);
      await tx.put('lesson', lesson());
      await tx.put('lesson', early);
    });
    const found = await store
      .read(SCOPE_A)
      .lessonsBetween('2026-10-12T06:00:00.000Z', '2026-10-13T00:00:00.000Z');
    expect(found.map((item) => item.id)).toEqual([early.id, LESSON_ID]);
  });

  it('keeps ops in queue order and updates them in place', async () => {
    const store = create();
    await store.write(SCOPE_A, async (tx) => {
      await tx.putOp(queued(op(2), { seq: 2 }));
      await tx.putOp(queued(op(1), { seq: 1 }));
      await tx.putOp(queued(op(3), { seq: 3 }));
    });
    await store.write(SCOPE_A, async (tx) => {
      await tx.putOp(
        queued(op(2), {
          seq: 2,
          state: 'conflict',
          error: { code: 'version_conflict', message: 'Changed.' },
        }),
      );
      await tx.removeOp(op(3).opId);
    });
    const ops = await store.read(SCOPE_A).ops();
    expect(ops.map((item) => [item.op.opId, item.state])).toEqual([
      [op(1).opId, 'pending'],
      [op(2).opId, 'conflict'],
    ]);
    expect(ops[1]?.error).toEqual({ code: 'version_conflict', message: 'Changed.' });
  });

  it('keeps a cursor per membership', async () => {
    const store = create();
    expect(await store.read(SCOPE_A).cursor()).toBeNull();
    await store.write(SCOPE_A, (tx) => tx.setCursor('42'));
    await store.write(SCOPE_A, (tx) => tx.setCursor('43'));
    expect(await store.read(SCOPE_A).cursor()).toBe('43');
    expect(await store.read(SCOPE_B).cursor()).toBeNull();
  });

  it('never mixes data between memberships', async () => {
    const store = create();
    await store.write(SCOPE_A, async (tx) => {
      await tx.put('lesson', lesson());
      await tx.putOp(queued(op(1)));
    });
    const other = store.read(SCOPE_B);
    expect(await other.get('lesson', LESSON_ID)).toBeNull();
    expect(await other.list('lesson')).toEqual([]);
    expect(await other.ops()).toEqual([]);
    expect(
      await other.lessonsBetween('2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'),
    ).toEqual([]);
  });

  it('wipes every membership', async () => {
    const store = create();
    for (const scope of [SCOPE_A, SCOPE_B]) {
      await store.write(scope, async (tx) => {
        await tx.put('lesson', lesson());
        await tx.putOp(queued(op(1)));
        await tx.setCursor('7');
      });
    }
    await store.wipe();
    for (const scope of [SCOPE_A, SCOPE_B]) {
      const reader = store.read(scope);
      expect(await reader.list('lesson')).toEqual([]);
      expect(await reader.ops()).toEqual([]);
      expect(await reader.cursor()).toBeNull();
    }
  });

  it('rolls a failed write back', async () => {
    const store = create();
    await expect(
      store.write(SCOPE_A, async (tx) => {
        await tx.put('lesson', lesson());
        await tx.setCursor('9');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await store.read(SCOPE_A).get('lesson', LESSON_ID)).toBeNull();
    expect(await store.read(SCOPE_A).cursor()).toBeNull();
  });

  it('returns the value of a write', async () => {
    const store = create();
    expect(await store.write(SCOPE_A, async () => 'done')).toBe('done');
  });
});
