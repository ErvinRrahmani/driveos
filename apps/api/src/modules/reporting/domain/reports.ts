import { type Bucket, periodOf, periodsBetween } from './buckets.js';

export function basisPoints(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part * 10_000) / whole);
}

export type PeriodSums<K extends string> = { period: string } & Record<K, number>;

export function sumByPeriod<K extends string>(
  rows: readonly ({ day: string } & Record<K, number>)[],
  from: string,
  to: string,
  bucket: Bucket,
  keys: readonly K[],
): PeriodSums<K>[] {
  const sums = new Map<string, Record<string, number>>(
    periodsBetween(from, to, bucket).map((period) => [
      period,
      Object.fromEntries(keys.map((key) => [key, 0])),
    ]),
  );
  for (const row of rows) {
    if (row.day < from || row.day > to) continue;
    const sum = sums.get(periodOf(row.day, bucket));
    if (!sum) continue;
    for (const key of keys) sum[key] = (sum[key] ?? 0) + row[key];
  }
  return [...sums.entries()].map(([period, sum]) => ({ period, ...sum }) as PeriodSums<K>);
}

export function totalOf<K extends string>(
  items: readonly ({ period?: string } & Record<K, number>)[],
  keys: readonly K[],
): Record<K, number> {
  const total = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  for (const item of items) {
    for (const key of keys) total[key] += item[key];
  }
  return total;
}
