import { describe, expect, it } from 'vitest';
import { formatDuration, formatMoney, groupByDay, splitLessons } from '../../src/lib/format';
import { i18n } from '../../src/lib/i18n';

const t = i18n.t.bind(i18n);

describe('formatMoney', () => {
  it('formats minor units in the currency', () => {
    expect(formatMoney(60000, 'EUR', 'en')).toBe('€600.00');
    expect(formatMoney(2900, 'EUR', 'en')).toBe('€29.00');
  });

  it('respects currencies without minor units', () => {
    expect(formatMoney(1500, 'JPY', 'en')).toBe('¥1,500');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(-6500, 'EUR', 'en')).toBe('-€65.00');
  });
});

describe('formatDuration', () => {
  it('shows credit minutes as hours and minutes', () => {
    expect(formatDuration(t, 540)).toBe('9 h');
    expect(formatDuration(t, 90)).toBe('1 h 30 min');
    expect(formatDuration(t, 45)).toBe('45 min');
    expect(formatDuration(t, 0)).toBe('0 min');
  });

  it('keeps the sign of negative balances', () => {
    expect(formatDuration(t, -60)).toBe('-1 h');
  });
});

describe('groupByDay', () => {
  it('groups items by the calendar day in the school time zone', () => {
    const slots = [
      { start: '2026-10-12T22:30:00.000Z' },
      { start: '2026-10-13T08:00:00.000Z' },
      { start: '2026-10-12T08:00:00.000Z' },
    ];
    const groups = groupByDay(slots, 'Europe/Berlin');
    expect(groups.map((group) => group.day)).toEqual(['2026-10-12', '2026-10-13']);
    expect(groups[0]?.items.map((slot) => slot.start)).toEqual(['2026-10-12T08:00:00.000Z']);
    expect(groups[1]?.items.map((slot) => slot.start)).toEqual([
      '2026-10-12T22:30:00.000Z',
      '2026-10-13T08:00:00.000Z',
    ]);
  });
});

describe('splitLessons', () => {
  const lesson = (id: string, start: string, end: string, status = 'booked') => ({
    id,
    start,
    end,
    status,
  });
  const now = Date.parse('2026-10-08T12:00:00.000Z');

  it('puts booked lessons that have not ended in upcoming, soonest first', () => {
    const { upcoming, past } = splitLessons(
      [
        lesson('b', '2026-10-12T08:00:00.000Z', '2026-10-12T09:00:00.000Z'),
        lesson('a', '2026-10-08T11:30:00.000Z', '2026-10-08T12:30:00.000Z'),
        lesson('c', '2026-10-01T08:00:00.000Z', '2026-10-01T09:00:00.000Z', 'completed'),
        lesson('d', '2026-10-09T08:00:00.000Z', '2026-10-09T09:00:00.000Z', 'cancelled'),
        lesson('e', '2026-10-02T08:00:00.000Z', '2026-10-02T09:00:00.000Z'),
      ],
      now,
    );
    expect(upcoming.map((item) => item.id)).toEqual(['a', 'b']);
    expect(past.map((item) => item.id)).toEqual(['d', 'e', 'c']);
  });
});
