import { describe, expect, it } from 'vitest';
import {
  generateLoginCode,
  generateRefreshToken,
  hashSecret,
  secretMatches,
} from '../../../src/modules/identity/domain/secrets.js';

describe('login code and token secrets', () => {
  it('generates 6-digit codes, zero-padded', () => {
    const codes = Array.from({ length: 200 }, () => generateLoginCode());
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(150);
  });

  it('generates 256-bit url-safe refresh tokens', () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateRefreshToken()).not.toBe(token);
  });

  it('hashes with the pepper, so the same value under another pepper differs', () => {
    const hash = hashSecret('pepper-1', '+4915550000002:123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret('pepper-1', '+4915550000002:123456')).toBe(hash);
    expect(hashSecret('pepper-2', '+4915550000002:123456')).not.toBe(hash);
  });

  it('compares a value against a stored hash', () => {
    const hash = hashSecret('pepper', 'value');
    expect(secretMatches(hash, 'pepper', 'value')).toBe(true);
    expect(secretMatches(hash, 'pepper', 'other')).toBe(false);
    expect(secretMatches('short', 'pepper', 'value')).toBe(false);
  });
});
