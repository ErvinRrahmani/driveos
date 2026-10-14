import { describe, expect, it } from 'vitest';
import {
  isIanaTimeZone,
  isIsoCurrency,
  localeRuleIssues,
} from '../../../src/modules/school/domain/locale-rules.js';

describe('isIanaTimeZone', () => {
  it.each([
    'Europe/Berlin',
    'Europe/Lisbon',
    'America/Argentina/Buenos_Aires',
    'UTC',
    'Asia/Kolkata',
  ])('accepts %s', (zone) => {
    expect(isIanaTimeZone(zone)).toBe(true);
  });

  it.each(['Mars/Olympus', 'Europe/Atlantis', '+01:00', '-0500', '', 'europe/berlin', 'Berlin'])(
    'rejects %s',
    (zone) => {
      expect(isIanaTimeZone(zone)).toBe(false);
    },
  );
});

describe('isIsoCurrency', () => {
  it.each(['EUR', 'USD', 'GBP', 'CHF', 'PLN'])('accepts %s', (code) => {
    expect(isIsoCurrency(code)).toBe(true);
  });

  it.each(['ABC', 'eur', 'EURO', 'XXX', ''])('rejects %s', (code) => {
    expect(isIsoCurrency(code)).toBe(false);
  });
});

describe('localeRuleIssues', () => {
  it('names each invalid field and ignores missing ones', () => {
    expect(localeRuleIssues({})).toEqual([]);
    expect(localeRuleIssues({ timeZone: 'Europe/Berlin', currency: 'EUR' })).toEqual([]);
    expect(localeRuleIssues({ timeZone: 'Nowhere', currency: 'EURO' })).toEqual([
      { path: ['timeZone'], message: 'Expected an IANA time zone' },
      { path: ['currency'], message: 'Expected an ISO 4217 currency code' },
    ]);
  });
});
