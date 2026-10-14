export const REFRESH_GRACE_MS = 30_000;

const DAY_MS = 86_400_000;

export type RefreshClient = 'web' | 'mobile';

export interface RefreshTokenState {
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export type RefreshDecision = 'rotate' | 'grace' | 'reused' | 'invalid';

export function decideRefresh(
  state: RefreshTokenState,
  now: Date,
  graceMs: number = REFRESH_GRACE_MS,
): RefreshDecision {
  if (state.revokedAt) return 'invalid';
  if (state.expiresAt.getTime() <= now.getTime()) return 'invalid';
  if (!state.rotatedAt) return 'rotate';
  return now.getTime() - state.rotatedAt.getTime() <= graceMs ? 'grace' : 'reused';
}

export interface RefreshTtl {
  webDays: number;
  mobileDays: number;
}

export function refreshTokenExpiry(client: RefreshClient, now: Date, ttl: RefreshTtl): Date {
  const days = client === 'mobile' ? ttl.mobileDays : ttl.webDays;
  return new Date(now.getTime() + days * DAY_MS);
}
