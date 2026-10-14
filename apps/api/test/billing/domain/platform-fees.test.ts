import { describe, expect, it } from 'vitest';
import {
  monthOf,
  nextMonthStart,
  periodMonthOf,
  previousMonth,
  proratedBaseMinor,
  reversalAllowed,
  statementTotalMinor,
} from '../../../src/modules/billing/domain/platform-fees.js';

describe('period months', () => {
  it('maps an instant to the first day of its UTC month', () => {
    expect(periodMonthOf(new Date('2026-09-30T23:30:00Z'))).toBe('2026-09-01');
    expect(periodMonthOf(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10-01');
  });

  it('turns a stored period month back into YYYY-MM', () => {
    expect(monthOf('2026-09-01')).toBe('2026-09');
  });

  it('finds the start of the following month', () => {
    expect(nextMonthStart('2026-09').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(nextMonthStart('2026-12').toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('finds the previous UTC month, across a year boundary', () => {
    expect(previousMonth(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09');
    expect(previousMonth(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12');
  });
});

describe('proratedBaseMinor', () => {
  const base = { baseAmountMinor: 4900, month: '2026-09' };

  it('charges the full base when the subscription started before the month', () => {
    expect(proratedBaseMinor({ ...base, startedAt: new Date('2026-03-15T10:00:00Z') })).toBe(4900);
    expect(proratedBaseMinor({ ...base, startedAt: new Date('2026-09-01T00:00:00Z') })).toBe(4900);
  });

  it('pro-rates a first month by active days (start day included), rounded half up', () => {
    expect(proratedBaseMinor({ ...base, startedAt: new Date('2026-09-16T08:00:00Z') })).toBe(2450);
    expect(proratedBaseMinor({ ...base, startedAt: new Date('2026-09-30T23:00:00Z') })).toBe(163);
    expect(
      proratedBaseMinor({
        baseAmountMinor: 100,
        month: '2026-09',
        startedAt: new Date('2026-09-29T00:00:00Z'),
      }),
    ).toBe(7);
    expect(
      proratedBaseMinor({
        baseAmountMinor: 15,
        month: '2026-09',
        startedAt: new Date('2026-09-30T00:00:00Z'),
      }),
    ).toBe(1);
  });

  it('uses the length of the month', () => {
    expect(
      proratedBaseMinor({
        baseAmountMinor: 2800,
        month: '2027-02',
        startedAt: new Date('2027-02-15T00:00:00Z'),
      }),
    ).toBe(1400);
  });

  it('charges nothing when the subscription started after the month', () => {
    expect(proratedBaseMinor({ ...base, startedAt: new Date('2026-10-01T00:00:00Z') })).toBe(0);
  });

  it('is 0 for a free (solo) plan', () => {
    expect(
      proratedBaseMinor({
        ...base,
        baseAmountMinor: 0,
        startedAt: new Date('2026-09-10T00:00:00Z'),
      }),
    ).toBe(0);
  });
});

describe('reversalAllowed', () => {
  const charged = new Date('2026-09-01T10:00:00Z');
  const day = 86_400_000;

  it('allows a reversal within 14 days of the charge when no lesson was completed', () => {
    expect(reversalAllowed({ chargedAt: charged, archivedAt: charged, completedLessons: 0 })).toBe(
      true,
    );
    expect(
      reversalAllowed({
        chargedAt: charged,
        archivedAt: new Date(charged.getTime() + 14 * day),
        completedLessons: 0,
      }),
    ).toBe(true);
  });

  it('refuses after 14 days', () => {
    expect(
      reversalAllowed({
        chargedAt: charged,
        archivedAt: new Date(charged.getTime() + 14 * day + 1),
        completedLessons: 0,
      }),
    ).toBe(false);
  });

  it('refuses when the student completed a lesson', () => {
    expect(
      reversalAllowed({
        chargedAt: charged,
        archivedAt: new Date(charged.getTime() + day),
        completedLessons: 1,
      }),
    ).toBe(false);
  });
});

describe('statementTotalMinor', () => {
  it('sums the base and the charges', () => {
    expect(statementTotalMinor([4900, 300, 300, -300])).toBe(5200);
  });

  it('never goes below 0', () => {
    expect(statementTotalMinor([0, -300])).toBe(0);
    expect(statementTotalMinor([])).toBe(0);
  });
});
