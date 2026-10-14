import { describe, expect, it } from 'vitest';
import {
  supportSessionExpiry,
  supportSessionSecondsLeft,
  supportSessionState,
} from '../../../src/modules/platform/domain/support-session.js';

const now = new Date('2026-10-08T10:00:00.000Z');

describe('supportSessionExpiry', () => {
  it('lasts the asked minutes, never more than 60', () => {
    expect(supportSessionExpiry(now, 30).toISOString()).toBe('2026-10-08T10:30:00.000Z');
    expect(supportSessionExpiry(now, 60).toISOString()).toBe('2026-10-08T11:00:00.000Z');
    expect(supportSessionExpiry(now, 600).toISOString()).toBe('2026-10-08T11:00:00.000Z');
  });
});

describe('supportSessionState', () => {
  const session = {
    schoolId: 'school-a',
    platformAdminUserId: 'admin',
    expiresAt: new Date('2026-10-08T10:30:00.000Z'),
    endedAt: null,
  };
  const token = { schoolId: 'school-a', userId: 'admin' };

  it('is active until it expires or ends', () => {
    expect(supportSessionState(session, token, now)).toBe('active');
    expect(supportSessionState(session, token, new Date('2026-10-08T10:30:00.000Z'))).toBe('ended');
    expect(supportSessionState({ ...session, endedAt: now }, token, now)).toBe('ended');
  });

  it('treats a missing session or a token for another school or admin as ended', () => {
    expect(supportSessionState(null, token, now)).toBe('ended');
    expect(supportSessionState(session, { ...token, schoolId: 'school-b' }, now)).toBe('ended');
    expect(supportSessionState(session, { ...token, userId: 'someone' }, now)).toBe('ended');
  });

  it('gives the seconds left', () => {
    expect(supportSessionSecondsLeft(session.expiresAt, now)).toBe(1800);
    expect(supportSessionSecondsLeft(session.expiresAt, new Date('2026-10-08T11:00:00Z'))).toBe(0);
  });
});
