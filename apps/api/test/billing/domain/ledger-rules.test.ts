import { describe, expect, it } from 'vitest';
import {
  assertLedgerMinutes,
  keepsBalanceAllowed,
} from '../../../src/modules/billing/domain/ledger-rules.js';

describe('keepsBalanceAllowed', () => {
  it('always allows adding minutes', () => {
    expect(keepsBalanceAllowed({ balance: -30, delta: 10, allowNegative: false })).toBe(true);
  });

  it('allows taking minutes down to exactly zero', () => {
    expect(keepsBalanceAllowed({ balance: 60, delta: -60, allowNegative: false })).toBe(true);
  });

  it('refuses going below zero unless negative balances are allowed', () => {
    expect(keepsBalanceAllowed({ balance: 60, delta: -61, allowNegative: false })).toBe(false);
    expect(keepsBalanceAllowed({ balance: 60, delta: -61, allowNegative: true })).toBe(true);
  });
});

describe('assertLedgerMinutes', () => {
  it('needs positive whole minutes for debit, restore and purchase', () => {
    for (const kind of ['debit', 'restore', 'purchase'] as const) {
      expect(() => assertLedgerMinutes(kind, 45)).not.toThrow();
      expect(() => assertLedgerMinutes(kind, 0)).toThrow(RangeError);
      expect(() => assertLedgerMinutes(kind, -45)).toThrow(RangeError);
      expect(() => assertLedgerMinutes(kind, 4.5)).toThrow(RangeError);
    }
  });

  it('needs non-zero whole minutes for an adjustment', () => {
    expect(() => assertLedgerMinutes('adjustment', -30)).not.toThrow();
    expect(() => assertLedgerMinutes('adjustment', 30)).not.toThrow();
    expect(() => assertLedgerMinutes('adjustment', 0)).toThrow(RangeError);
    expect(() => assertLedgerMinutes('adjustment', 0.5)).toThrow(RangeError);
  });
});
