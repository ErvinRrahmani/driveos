const DAY_MS = 86_400_000;

export const STUDENT_FEE_REVERSAL_DAYS = 14;

export function periodMonthOf(at: Date): string {
  return `${at.toISOString().slice(0, 7)}-01`;
}

export function monthOf(periodMonth: string): string {
  return periodMonth.slice(0, 7);
}

export function previousMonth(now: Date): string {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return first.toISOString().slice(0, 7);
}

export function nextMonthStart(month: string): Date {
  return new Date(monthBounds(month).end);
}

function monthBounds(month: string): { start: number; end: number; days: number } {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const start = Date.UTC(year, monthIndex - 1, 1);
  const end = Date.UTC(year, monthIndex, 1);
  return { start, end, days: Math.round((end - start) / DAY_MS) };
}

export interface ProratedBaseInput {
  baseAmountMinor: number;
  month: string;
  startedAt: Date;
}

export function proratedBaseMinor({
  baseAmountMinor,
  month,
  startedAt,
}: ProratedBaseInput): number {
  const { start, end, days } = monthBounds(month);
  const started = startedAt.getTime();
  if (started >= end) return 0;
  if (started <= start) return baseAmountMinor;
  const startDay = Date.UTC(
    startedAt.getUTCFullYear(),
    startedAt.getUTCMonth(),
    startedAt.getUTCDate(),
  );
  const activeDays = Math.round((end - startDay) / DAY_MS);
  return Math.floor((2 * baseAmountMinor * activeDays + days) / (2 * days));
}

export interface ReversalInput {
  chargedAt: Date;
  archivedAt: Date;
  completedLessons: number;
}

export function reversalAllowed({
  chargedAt,
  archivedAt,
  completedLessons,
}: ReversalInput): boolean {
  if (completedLessons > 0) return false;
  return archivedAt.getTime() - chargedAt.getTime() <= STUDENT_FEE_REVERSAL_DAYS * DAY_MS;
}

export function statementTotalMinor(amounts: readonly number[]): number {
  return Math.max(
    0,
    amounts.reduce((sum, amount) => sum + amount, 0),
  );
}
