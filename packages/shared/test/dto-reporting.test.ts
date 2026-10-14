import { describe, expect, it } from 'vitest';
import {
  growthReportQuerySchema,
  REPORT_RANGE_MAX_DAYS,
  reportRangeQuerySchema,
  revenueReportResponseSchema,
} from '../src/index.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('report queries', () => {
  it('takes a YYYY-MM month for the growth report', () => {
    expect(ok(growthReportQuerySchema, { month: '2026-09' })).toBe(true);
    expect(ok(growthReportQuerySchema, { month: '2026-13' })).toBe(false);
  });

  it('takes an ordered, bounded date range and defaults to daily buckets', () => {
    expect(reportRangeQuerySchema.parse({ from: '2026-09-01', to: '2026-09-30' }).bucket).toBe(
      'day',
    );
    expect(ok(reportRangeQuerySchema, { from: '2026-09-30', to: '2026-09-01' })).toBe(false);
    const to = new Date(Date.parse('2026-01-01') + REPORT_RANGE_MAX_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(ok(reportRangeQuerySchema, { from: '2026-01-01', to })).toBe(false);
  });
});

describe('revenue report', () => {
  it('carries a currency with every money bucket', () => {
    const report = revenueReportResponseSchema.parse(DTO_SAMPLES.reporting.revenueReportResponse);
    expect(report.items.every((item) => /^[A-Z]{3}$/.test(item.currency))).toBe(true);
    expect(report.totals.currency).toMatch(/^[A-Z]{3}$/);
    const [first] = report.items;
    expect(
      ok(revenueReportResponseSchema, { ...report, items: [{ ...first, revenueInAppMinor: 1.5 }] }),
    ).toBe(false);
  });
});
