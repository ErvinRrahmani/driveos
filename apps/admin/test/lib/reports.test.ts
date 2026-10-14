import { describe, expect, it } from 'vitest';
import {
  bucketFor,
  buildReportRange,
  defaultReportRange,
  isGrowthReportMissing,
  lastMonths,
  niceCeiling,
} from '../../src/lib/reports';

describe('lastMonths', () => {
  it('lists n months ending at the given month, newest first, across a year', () => {
    expect(lastMonths('2026-02', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
    expect(lastMonths('2026-09', 12)).toHaveLength(12);
    expect(lastMonths('2026-09', 12).at(-1)).toBe('2025-10');
  });
});

describe('defaultReportRange', () => {
  it('covers the last 30 days including today', () => {
    expect(defaultReportRange('2026-10-08')).toEqual({ from: '2026-09-09', to: '2026-10-08' });
  });
});

describe('bucketFor', () => {
  it('picks days for a month, weeks for a quarter, months beyond', () => {
    expect(bucketFor('2026-09-01', '2026-09-30')).toBe('day');
    expect(bucketFor('2026-07-01', '2026-09-30')).toBe('week');
    expect(bucketFor('2026-01-01', '2026-09-30')).toBe('month');
  });
});

describe('niceCeiling', () => {
  it('rounds up to 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(7)).toBe(10);
    expect(niceCeiling(48)).toBe(50);
    expect(niceCeiling(120000)).toBe(200000);
    expect(niceCeiling(8000)).toBe(10000);
    expect(niceCeiling(1500)).toBe(2000);
  });
});

describe('buildReportRange', () => {
  it('picks the bucket automatically when none is chosen', () => {
    expect(buildReportRange({ from: '2026-07-01', to: '2026-09-30' })).toEqual({
      ok: true,
      range: { from: '2026-07-01', to: '2026-09-30', bucket: 'week' },
    });
  });

  it('keeps an explicitly chosen bucket', () => {
    expect(buildReportRange({ from: '2026-09-01', to: '2026-09-30', bucket: 'month' })).toEqual({
      ok: true,
      range: { from: '2026-09-01', to: '2026-09-30', bucket: 'month' },
    });
  });

  it('rejects a range that ends before it starts', () => {
    expect(buildReportRange({ from: '2026-09-30', to: '2026-09-01' })).toEqual({ ok: false });
  });

  it('rejects a range longer than the API allows', () => {
    expect(buildReportRange({ from: '2025-01-01', to: '2026-01-02' })).toEqual({ ok: false });
    expect(buildReportRange({ from: '2025-01-01', to: '2026-01-01' }).ok).toBe(true);
  });

  it('rejects malformed dates', () => {
    expect(buildReportRange({ from: '2026-13-01', to: '2026-09-01' })).toEqual({ ok: false });
  });
});

describe('isGrowthReportMissing', () => {
  it('treats growth_report_missing and not_found as no report for the month', () => {
    expect(isGrowthReportMissing({ error: { code: 'growth_report_missing', message: 'x' } })).toBe(
      true,
    );
    expect(isGrowthReportMissing({ error: { code: 'not_found', message: 'x' } })).toBe(true);
  });

  it('does not hide other failures', () => {
    expect(isGrowthReportMissing({ error: { code: 'internal_error', message: 'x' } })).toBe(false);
    expect(isGrowthReportMissing(new TypeError('Failed to fetch'))).toBe(false);
  });
});
