import { describe, expect, it } from 'vitest';
import { summarizeProgress } from '../../../src/modules/training/domain/progress.js';

const items = [
  { id: 's2', code: 'B02', title: 'Moving off', sortOrder: 2 },
  { id: 's1', code: 'B01', title: 'Cockpit drill', sortOrder: 1 },
  { id: 's3', code: 'B03', title: 'Junctions', sortOrder: 3 },
];

const at = (day: number) => new Date(Date.UTC(2026, 9, day, 9));

describe('summarizeProgress', () => {
  it('lists every syllabus item in sort order, unrated ones with a null level and 0%', () => {
    const summary = summarizeProgress(items, [], 5);

    expect(summary.progressPct).toBe(0);
    expect(summary.items.map((item) => item.code)).toEqual(['B01', 'B02', 'B03']);
    expect(summary.items[0]).toEqual({
      syllabusItemId: 's1',
      code: 'B01',
      title: 'Cockpit drill',
      sortOrder: 1,
      level: null,
      lastNote: null,
      lessonCount: 0,
      updatedAt: null,
    });
  });

  it('takes the level of the latest lesson, the last non-empty note and counts distinct lessons', () => {
    const summary = summarizeProgress(
      items,
      [
        { syllabusItemId: 's1', lessonId: 'l2', level: 4, note: '', at: at(5), updatedAt: at(6) },
        {
          syllabusItemId: 's1',
          lessonId: 'l1',
          level: 2,
          note: 'Mirrors',
          at: at(1),
          updatedAt: at(9),
        },
        {
          syllabusItemId: 's2',
          lessonId: 'l2',
          level: 1,
          note: 'Clutch',
          at: at(5),
          updatedAt: at(5),
        },
      ],
      5,
    );

    expect(summary.items[0]).toMatchObject({
      level: 4,
      lastNote: 'Mirrors',
      lessonCount: 2,
      updatedAt: at(9),
    });
    expect(summary.items[1]).toMatchObject({ level: 1, lastNote: 'Clutch', lessonCount: 1 });
    expect(summary.items[2]).toMatchObject({ level: null, lessonCount: 0 });
  });

  it('computes progressPct as the mean latest level over all items (unrated = 0) over the max level', () => {
    const summary = summarizeProgress(
      items,
      [
        { syllabusItemId: 's1', lessonId: 'l1', level: 5, note: '', at: at(1), updatedAt: at(1) },
        { syllabusItemId: 's2', lessonId: 'l1', level: 3, note: '', at: at(1), updatedAt: at(1) },
      ],
      5,
    );

    expect(summary.progressPct).toBe(53);
  });

  it('ignores entries for items outside the syllabus and returns 0% for an empty syllabus', () => {
    const outside = {
      syllabusItemId: 'x',
      lessonId: 'l1',
      level: 5,
      note: 'n',
      at: at(1),
      updatedAt: at(1),
    };

    expect(summarizeProgress(items, [outside], 5).progressPct).toBe(0);
    expect(summarizeProgress([], [outside], 5)).toEqual({ items: [], progressPct: 0 });
  });

  it('breaks ties on the same lesson time by the latest update', () => {
    const summary = summarizeProgress(
      items,
      [
        { syllabusItemId: 's3', lessonId: 'l1', level: 2, note: 'a', at: at(3), updatedAt: at(3) },
        { syllabusItemId: 's3', lessonId: 'l2', level: 3, note: 'b', at: at(3), updatedAt: at(4) },
      ],
      5,
    );

    expect(summary.items[2]).toMatchObject({ level: 3, lastNote: 'b', lessonCount: 2 });
  });
});
