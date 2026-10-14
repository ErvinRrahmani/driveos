import { type ReportBucket, reportRangeQuerySchema } from '@driveos/shared';
import { apiErrorCode } from './api-errors';
import { addDays } from './zoned-time';

const GROWTH_REPORT_MISSING_CODES = new Set(['growth_report_missing', 'not_found']);

export interface ReportRange {
  from: string;
  to: string;
  bucket: ReportBucket;
}

const DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 30;

export function lastMonths(month: string, count: number): string[] {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(year, monthIndex - 1 - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function defaultReportRange(today: string): { from: string; to: string } {
  return { from: addDays(today, 1 - DEFAULT_RANGE_DAYS), to: today };
}

export function bucketFor(from: string, to: string): ReportBucket {
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((factor) => factor * power >= value) ?? 10;
  return step * power;
}

export function buildReportRange(input: {
  from: string;
  to: string;
  bucket?: ReportBucket;
}): { ok: true; range: ReportRange } | { ok: false } {
  const parsed = reportRangeQuerySchema.safeParse({
    ...input,
    bucket: input.bucket ?? bucketFor(input.from, input.to),
  });
  return parsed.success ? { ok: true, range: parsed.data } : { ok: false };
}

export function isGrowthReportMissing(error: unknown): boolean {
  return GROWTH_REPORT_MISSING_CODES.has(apiErrorCode(error) ?? '');
}
