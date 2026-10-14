import { describe, expect, it } from 'vitest';
import {
  INVITATION_TTL_MS,
  invitationExpiry,
  invitationState,
} from '../../../src/modules/identity/domain/invitation.js';

const now = new Date('2026-10-08T12:00:00Z');

describe('invitation lifetime', () => {
  it('expires seven days after creation', () => {
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(invitationExpiry(now).toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });

  it('is open before expiry, expired at or after it, and used once accepted', () => {
    const expiresAt = new Date('2026-10-08T12:00:01Z');
    expect(invitationState({ expiresAt, acceptedAt: null }, now)).toBe('open');
    expect(invitationState({ expiresAt: now, acceptedAt: null }, now)).toBe('expired');
    expect(invitationState({ expiresAt, acceptedAt: now }, now)).toBe('used');
    expect(invitationState({ expiresAt: new Date(0), acceptedAt: now }, now)).toBe('used');
  });
});
