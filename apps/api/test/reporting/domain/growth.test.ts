import { describe, expect, it } from 'vitest';
import {
  type GrowthDayRow,
  growthMetrics,
  growthMonthDue,
  monthBounds,
  shiftMonth,
} from '../../../src/modules/reporting/domain/growth.js';

const ZERO = {
  currency: 'EUR',
  revenueInAppMinor: 0,
  revenueRecordedMinor: 0,
  lateCancellations: 0,
  lateCancelMinutesKept: 0,
  noShows: 0,
  lessonsDue: 0,
  upsellsSold: 0,
  upsellRevenueMinor: 0,
  slotsFilled: 0,
  slotFillMinutes: 0,
};

const row = (day: string, counts: Partial<GrowthDayRow> = {}): GrowthDayRow => ({
  day,
  ...ZERO,
  ...counts,
});

describe('monthBounds', () => {
  it('gives the first and last local day of the month', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('shiftMonth', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-02', -3)).toBe('2025-11');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });
});

describe('growthMonthDue', () => {
  const zone = 'Europe/Budapest';

  it('is null before 03:00 local time', () => {
    expect(growthMonthDue(new Date('2026-10-01T00:59:00Z'), zone)).toBeNull();
    expect(growthMonthDue(new Date('2026-10-15T00:30:00Z'), zone)).toBeNull();
  });

  it('is the previous calendar month from 03:00 local time on', () => {
    expect(growthMonthDue(new Date('2026-10-01T01:00:00Z'), zone)).toBe('2026-09');
    expect(growthMonthDue(new Date('2026-10-15T12:00:00Z'), zone)).toBe('2026-09');
    expect(growthMonthDue(new Date('2027-01-01T02:00:00Z'), zone)).toBe('2026-12');
  });

  it('uses the local date, not the UTC date', () => {
    expect(growthMonthDue(new Date('2026-09-30T15:00:00Z'), 'Pacific/Auckland')).toBe('2026-09');
    expect(growthMonthDue(new Date('2026-11-01T02:30:00Z'), 'America/New_York')).toBe('2026-09');
  });

  it('follows the winter offset after the DST change', () => {
    expect(growthMonthDue(new Date('2026-11-01T01:59:00Z'), zone)).toBeNull();
    expect(growthMonthDue(new Date('2026-11-01T02:00:00Z'), zone)).toBe('2026-10');
  });
});

describe('growthMetrics', () => {
  it('sums the month and derives the in-app share and no-show rates', () => {
    const metrics = growthMetrics({
      currency: 'EUR',
      month: [
        row('2026-09-01', {
          revenueInAppMinor: 30_000,
          revenueRecordedMinor: 40_000,
          lateCancellations: 1,
          lateCancelMinutesKept: 45,
          noShows: 1,
          lessonsDue: 6,
          upsellsSold: 1,
          upsellRevenueMinor: 5_000,
          slotsFilled: 1,
          slotFillMinutes: 90,
        }),
        row('2026-09-30', {
          revenueInAppMinor: 10_000,
          revenueRecordedMinor: 20_000,
          lateCancellations: 2,
          lateCancelMinutesKept: 60,
          noShows: 1,
          lessonsDue: 2,
          slotsFilled: 2,
          slotFillMinutes: 120,
        }),
      ],
      previous: [
        row('2026-06-10', { noShows: 3, lessonsDue: 10 }),
        row('2026-07-10', { noShows: 0, lessonsDue: 5 }),
        row('2026-08-10', { noShows: 1, lessonsDue: 5 }),
      ],
    });
    expect(metrics).toEqual({
      currency: 'EUR',
      revenueInAppMinor: 40_000,
      revenueRecordedMinor: 60_000,
      inappShareBp: 6667,
      lateCancellationsKept: 3,
      lateCancelMinutesKept: 105,
      noShowRateBp: 2500,
      noShowRatePrev3mBp: 2000,
      upsellsSold: 1,
      upsellRevenueMinor: 5_000,
      slotsFilled: 3,
      slotFillMinutes: 210,
    });
  });

  it('pools the previous three months instead of averaging their rates', () => {
    const metrics = growthMetrics({
      currency: 'EUR',
      month: [],
      previous: [
        row('2026-06-10', { noShows: 1, lessonsDue: 1 }),
        row('2026-07-10', { noShows: 0, lessonsDue: 9 }),
      ],
    });
    expect(metrics.noShowRatePrev3mBp).toBe(1000);
  });

  it('is 0 for every rate when the divisor is 0', () => {
    const metrics = growthMetrics({
      currency: 'EUR',
      month: [row('2026-09-02', { revenueInAppMinor: 0, noShows: 0 })],
      previous: [],
    });
    expect(metrics).toMatchObject({ inappShareBp: 0, noShowRateBp: 0, noShowRatePrev3mBp: 0 });
  });

  it('sums money only from days in the school currency', () => {
    const metrics = growthMetrics({
      currency: 'EUR',
      month: [
        row('2026-09-01', { revenueInAppMinor: 1_000, revenueRecordedMinor: 1_000, noShows: 1 }),
        row('2026-09-02', {
          currency: 'HUF',
          revenueInAppMinor: 900_000,
          revenueRecordedMinor: 900_000,
          upsellsSold: 1,
          upsellRevenueMinor: 900_000,
          lessonsDue: 4,
          noShows: 1,
        }),
      ],
      previous: [],
    });
    expect(metrics).toMatchObject({
      revenueInAppMinor: 1_000,
      revenueRecordedMinor: 1_000,
      inappShareBp: 10_000,
      upsellsSold: 0,
      upsellRevenueMinor: 0,
      noShowRateBp: 5000,
    });
  });
});
