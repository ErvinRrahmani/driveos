import { describe, expect, it } from 'vitest';
import {
  checkLoginCode,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_TTL_MS,
  loginCodeExpiry,
  loginCodeLimitReason,
} from '../../../src/modules/identity/domain/login-code.js';

const now = new Date('2026-10-08T10:00:00Z');
const live = { attempts: 0, expiresAt: new Date(now.getTime() + 60_000) };

describe('checkLoginCode', () => {
  it('accepts a matching live code', () => {
    expect(checkLoginCode(live, true, now)).toEqual({ outcome: 'accepted' });
  });

  it('counts a wrong attempt', () => {
    expect(checkLoginCode(live, false, now)).toEqual({ outcome: 'wrong', attempts: 1 });
    expect(checkLoginCode({ ...live, attempts: 4 }, false, now)).toEqual({
      outcome: 'wrong',
      attempts: 5,
    });
  });

  it('treats a code with 5 attempts as dead, even with the right code', () => {
    expect(LOGIN_CODE_MAX_ATTEMPTS).toBe(5);
    expect(checkLoginCode({ ...live, attempts: 5 }, true, now)).toEqual({ outcome: 'invalid' });
  });

  it('rejects an expired code as expired', () => {
    expect(checkLoginCode({ ...live, expiresAt: now }, true, now)).toEqual({ outcome: 'expired' });
  });

  it('rejects when there is no code', () => {
    expect(checkLoginCode(null, false, now)).toEqual({ outcome: 'invalid' });
  });

  it('expires codes after 5 minutes', () => {
    expect(LOGIN_CODE_TTL_MS).toBe(300_000);
    expect(loginCodeExpiry(now)).toEqual(new Date('2026-10-08T10:05:00Z'));
  });
});

describe('loginCodeLimitReason', () => {
  const limits = { perContact: 3, perIp: 20, perPrefixPerDay: 500 };

  it('allows counts within every limit', () => {
    expect(loginCodeLimitReason({ contact: 3, ip: 20, prefix: 499 }, limits)).toBeNull();
    expect(loginCodeLimitReason({ contact: 1, ip: 1, prefix: null }, limits)).toBeNull();
  });

  it('names the first exceeded limit', () => {
    expect(loginCodeLimitReason({ contact: 4, ip: 1, prefix: 0 }, limits)).toBe('contact');
    expect(loginCodeLimitReason({ contact: 1, ip: 21, prefix: 0 }, limits)).toBe('ip');
    expect(loginCodeLimitReason({ contact: 1, ip: 1, prefix: 500 }, limits)).toBe('prefix');
  });
});
