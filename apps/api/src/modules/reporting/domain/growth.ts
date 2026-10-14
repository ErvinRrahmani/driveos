import { addDays, localDayOf, localToUtc } from './buckets.js';
import { basisPoints } from './reports.js';

export const GROWTH_REPORT_LOCAL_TIME = '03:00';
export const NO_SHOW_TREND_MONTHS = 3;

export interface GrowthDayRow {
  day: string;
  currency: string;
  revenueInAppMinor: number;
  revenueRecordedMinor: number;
  lateCancellations: number;
  lateCancelMinutesKept: number;
  noShows: number;
  lessonsDue: number;
  upsellsSold: number;
  upsellRevenueMinor: number;
  slotsFilled: number;
  slotFillMinutes: number;
  leadsCaptured: number;
  leadsConverted: number;
  leadRevenueMinor: number;
}

export interface GrowthMetrics {
  currency: string;
  revenueInAppMinor: number;
  revenueRecordedMinor: number;
  inappShareBp: number;
  lateCancellationsKept: number;
  lateCancelMinutesKept: number;
  noShowRateBp: number;
  noShowRatePrev3mBp: number;
  upsellsSold: number;
  upsellRevenueMinor: number;
  slotsFilled: number;
  slotFillMinutes: number;
  leadsCaptured: number;
  leadsConverted: number;
  leadRevenueMinor: number;
}

export function shiftMonth(month: string, delta: number): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  const shifted = Math.floor(index / 12);
  return `${String(shifted).padStart(4, '0')}-${String(index - shifted * 12 + 1).padStart(2, '0')}`;
}

export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: addDays(`${shiftMonth(month, 1)}-01`, -1) };
}

export function growthMonthDue(now: Date, zone: string): string | null {
  const today = localDayOf(now, zone);
  if (now.getTime() < localToUtc(today, GROWTH_REPORT_LOCAL_TIME, zone).getTime()) return null;
  return shiftMonth(today.slice(0, 7), -1);
}

const sum = (rows: readonly GrowthDayRow[], key: keyof Omit<GrowthDayRow, 'day' | 'currency'>) =>
  rows.reduce((total, row) => total + row[key], 0);

export function growthMetrics(input: {
  currency: string;
  month: readonly GrowthDayRow[];
  previous: readonly GrowthDayRow[];
}): GrowthMetrics {
  const { currency, month, previous } = input;
  const money = month.filter((row) => row.currency === currency);
  const revenueInAppMinor = sum(money, 'revenueInAppMinor');
  const revenueRecordedMinor = sum(money, 'revenueRecordedMinor');
  return {
    currency,
    revenueInAppMinor,
    revenueRecordedMinor,
    inappShareBp: basisPoints(revenueInAppMinor, revenueRecordedMinor),
    lateCancellationsKept: sum(month, 'lateCancellations'),
    lateCancelMinutesKept: sum(month, 'lateCancelMinutesKept'),
    noShowRateBp: basisPoints(sum(month, 'noShows'), sum(month, 'lessonsDue')),
    noShowRatePrev3mBp: basisPoints(sum(previous, 'noShows'), sum(previous, 'lessonsDue')),
    upsellsSold: sum(money, 'upsellsSold'),
    upsellRevenueMinor: sum(money, 'upsellRevenueMinor'),
    slotsFilled: sum(month, 'slotsFilled'),
    slotFillMinutes: sum(month, 'slotFillMinutes'),
    leadsCaptured: sum(month, 'leadsCaptured'),
    leadsConverted: sum(month, 'leadsConverted'),
    leadRevenueMinor: sum(money, 'leadRevenueMinor'),
  };
}
