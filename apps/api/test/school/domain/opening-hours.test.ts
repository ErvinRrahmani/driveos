import { describe, expect, it } from 'vitest';
import { openingHoursOverlaps } from '../../../src/modules/school/domain/opening-hours.js';

const branch = '0192f000-0005-7000-8000-000000000001';

describe('openingHoursOverlaps', () => {
  it('accepts split shifts and the same hours on other days or branches', () => {
    expect(
      openingHoursOverlaps([
        { branchId: null, weekday: 1, opens: '08:00', closes: '12:00' },
        { branchId: null, weekday: 1, opens: '12:00', closes: '18:00' },
        { branchId: null, weekday: 2, opens: '08:00', closes: '12:00' },
        { branchId: branch, weekday: 1, opens: '08:00', closes: '12:00' },
      ]),
    ).toEqual([]);
  });

  it('reports overlapping ranges of the same branch and weekday by index', () => {
    expect(
      openingHoursOverlaps([
        { branchId: branch, weekday: 3, opens: '08:00', closes: '12:00' },
        { branchId: null, weekday: 3, opens: '09:00', closes: '10:00' },
        { branchId: branch, weekday: 3, opens: '11:30', closes: '14:00' },
      ]),
    ).toEqual([2]);
  });

  it('compares times with seconds correctly', () => {
    expect(
      openingHoursOverlaps([
        { branchId: null, weekday: 6, opens: '09:00:00', closes: '14:00' },
        { branchId: null, weekday: 6, opens: '13:59:30', closes: '15:00' },
      ]),
    ).toEqual([1]);
  });
});
