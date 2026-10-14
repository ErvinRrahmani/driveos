import { describe, expect, it } from 'vitest';
import {
  basisPoints,
  sumByPeriod,
  totalOf,
} from '../../../src/modules/reporting/domain/reports.js';

describe('basisPoints', () => {
  it('gives the share in basis points, rounded', () => {
    expect(basisPoints(1, 3)).toBe(3333);
    expect(basisPoints(2, 3)).toBe(6667);
    expect(basisPoints(5, 5)).toBe(10_000);
  });

  it('is zero when there is nothing to divide by', () => {
    expect(basisPoints(0, 0)).toBe(0);
    expect(basisPoints(3, 0)).toBe(0);
  });
});

describe('sumByPeriod', () => {
  const rows = [
    { day: '2026-10-12', a: 1, b: 10 },
    { day: '2026-10-14', a: 2, b: 20 },
    { day: '2026-10-19', a: 4, b: 40 },
  ];

  it('zero-fills every period of the range and sums the days into their period', () => {
    expect(sumByPeriod(rows, '2026-10-12', '2026-10-25', 'week', ['a', 'b'])).toEqual([
      { period: '2026-10-12', a: 3, b: 30 },
      { period: '2026-10-19', a: 4, b: 40 },
    ]);
    expect(sumByPeriod(rows, '2026-10-11', '2026-10-13', 'day', ['a'])).toEqual([
      { period: '2026-10-11', a: 0 },
      { period: '2026-10-12', a: 1 },
      { period: '2026-10-13', a: 0 },
    ]);
  });

  it('ignores rows outside the range', () => {
    expect(sumByPeriod(rows, '2026-10-13', '2026-10-14', 'month', ['a'])).toEqual([
      { period: '2026-10-01', a: 2 },
    ]);
  });
});

describe('totalOf', () => {
  it('adds the listed keys over all periods', () => {
    expect(
      totalOf(
        [
          { period: '2026-10-12', a: 3, b: 30 },
          { period: '2026-10-19', a: 4, b: 40 },
        ],
        ['a', 'b'],
      ),
    ).toEqual({ a: 7, b: 70 });
    expect(totalOf([], ['a'])).toEqual({ a: 0 });
  });
});
