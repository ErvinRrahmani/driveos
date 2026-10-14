import { describe, expect, it } from 'vitest';
import { countryPrefix, normalizeContact } from '../../../src/modules/identity/domain/contact.js';

describe('normalizeContact', () => {
  it.each([
    ['+4915550000002', '+4915550000002'],
    [' +49 1555 0000002 ', '+4915550000002'],
    ['+49 (1555) 000-0002', '+4915550000002'],
    ['004915550000002', '+4915550000002'],
    ['+351.910.000.005', '+351910000005'],
  ])('normalises phone %j to E.164 %s', (raw, value) => {
    expect(normalizeContact(raw)).toEqual({ kind: 'phone', value });
  });

  it.each([
    ['otto.owner@example.com', 'otto.owner@example.com'],
    ['  Otto.Owner@Example.COM ', 'otto.owner@example.com'],
  ])('lowercases email %j', (raw, value) => {
    expect(normalizeContact(raw)).toEqual({ kind: 'email', value });
  });

  it.each([
    '015550000002',
    '+0123456789',
    '+12345',
    '+1234567890123456',
    '+49 1555 abc',
    'not-an-email',
    'a@b',
    'two@@example.com',
    'spa ce@example.com',
    '',
  ])('rejects %j', (raw) => {
    expect(normalizeContact(raw)).toBeNull();
  });
});

describe('countryPrefix', () => {
  it('is the + and the first three digits of an E.164 number', () => {
    expect(countryPrefix('+4915550000002')).toBe('+491');
    expect(countryPrefix('+351910000005')).toBe('+351');
    expect(countryPrefix('+12025550123')).toBe('+120');
  });
});
