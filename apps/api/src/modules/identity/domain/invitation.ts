export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationState = 'open' | 'expired' | 'used';

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_MS);
}

export function invitationState(
  invitation: { expiresAt: Date; acceptedAt: Date | null },
  now: Date,
): InvitationState {
  if (invitation.acceptedAt) return 'used';
  return invitation.expiresAt.getTime() > now.getTime() ? 'open' : 'expired';
}
