import { describe, expect, it } from 'vitest';
import { isMinor, utcToday } from '../../../src/modules/training/domain/minor.js';

describe('isMinor', () => {
  it('is a minor until the birthday that reaches the age of majority', () => {
    expect(isMinor('2008-10-09', 18, '2026-10-08')).toBe(true);
    expect(isMinor('2008-10-08', 18, '2026-10-08')).toBe(false);
    expect(isMinor('1990-01-01', 18, '2026-10-08')).toBe(false);
  });

  it('follows the school age of majority', () => {
    expect(isMinor('2010-01-01', 16, '2026-10-08')).toBe(false);
    expect(isMinor('2010-12-31', 16, '2026-10-08')).toBe(true);
    expect(isMinor('2006-01-01', 21, '2026-10-08')).toBe(true);
  });

  it('counts a 29 February birthday from 1 March in non-leap years', () => {
    expect(isMinor('2008-02-29', 18, '2026-02-28')).toBe(true);
    expect(isMinor('2008-02-29', 18, '2026-03-01')).toBe(false);
  });
});

describe('utcToday', () => {
  it('is the UTC calendar date of the instant', () => {
    expect(utcToday(new Date('2026-10-08T23:59:59.999Z'))).toBe('2026-10-08');
    expect(utcToday(new Date('2026-10-09T00:00:00.000Z'))).toBe('2026-10-09');
  });
});
