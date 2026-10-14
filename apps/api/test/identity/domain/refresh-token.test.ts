import { describe, expect, it } from 'vitest';
import {
  decideRefresh,
  REFRESH_GRACE_MS,
  refreshTokenExpiry,
} from '../../../src/modules/identity/domain/refresh-token.js';

const now = new Date('2026-10-08T10:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const fresh = { expiresAt: new Date(now.getTime() + 1000), rotatedAt: null, revokedAt: null };

describe('decideRefresh', () => {
  it('rotates a live token', () => {
    expect(decideRefresh(fresh, now)).toBe('rotate');
  });

  it('serves the successor within the 30 s grace window', () => {
    expect(REFRESH_GRACE_MS).toBe(30_000);
    expect(decideRefresh({ ...fresh, rotatedAt: ago(0) }, now)).toBe('grace');
    expect(decideRefresh({ ...fresh, rotatedAt: ago(30_000) }, now)).toBe('grace');
  });

  it('treats a rotated token after the grace window as reuse', () => {
    expect(decideRefresh({ ...fresh, rotatedAt: ago(30_001) }, now)).toBe('reused');
  });

  it('rejects revoked and expired tokens', () => {
    expect(decideRefresh({ ...fresh, revokedAt: ago(1) }, now)).toBe('invalid');
    expect(decideRefresh({ ...fresh, rotatedAt: ago(1), revokedAt: ago(1) }, now)).toBe('invalid');
    expect(decideRefresh({ ...fresh, expiresAt: now }, now)).toBe('invalid');
  });
});

describe('refreshTokenExpiry', () => {
  const ttl = { webDays: 30, mobileDays: 90 };

  it('lasts 30 days on web and 90 days on mobile', () => {
    expect(refreshTokenExpiry('web', now, ttl)).toEqual(new Date('2026-11-07T10:00:00Z'));
    expect(refreshTokenExpiry('mobile', now, ttl)).toEqual(new Date('2027-01-06T10:00:00Z'));
  });
});
