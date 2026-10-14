import { describe, expect, it } from 'vitest';
import {
  basisPointsToPercent,
  formatMoney,
  fromMinor,
  percentToBasisPoints,
  toMinor,
} from '../../src/lib/money';

describe('money', () => {
  it('formats minor units with the currency', () => {
    expect(formatMoney(4500, 'EUR')).toBe('€45.00');
    expect(formatMoney(150000, 'EUR')).toBe('€1,500.00');
  });

  it('respects currencies without minor units', () => {
    expect(formatMoney(5000, 'JPY')).toBe('¥5,000');
    expect(toMinor(5000, 'JPY')).toBe(5000);
  });

  it('converts major input to integer minor units without float drift', () => {
    expect(toMinor(45, 'EUR')).toBe(4500);
    expect(toMinor(19.99, 'EUR')).toBe(1999);
    expect(toMinor(0.1 + 0.2, 'EUR')).toBe(30);
  });

  it('converts minor units back to major', () => {
    expect(fromMinor(1999, 'EUR')).toBe(19.99);
    expect(fromMinor(1999, 'JPY')).toBe(1999);
  });

  it('converts between percent and basis points', () => {
    expect(percentToBasisPoints(19)).toBe(1900);
    expect(percentToBasisPoints(7.25)).toBe(725);
    expect(basisPointsToPercent(1900)).toBe(19);
  });
});
