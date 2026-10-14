import { SUPPORT_SESSION_MAX_MINUTES } from '@driveos/shared';

export interface SupportSessionFacts {
  schoolId: string;
  platformAdminUserId: string;
  expiresAt: Date;
  endedAt: Date | null;
}

export function supportSessionExpiry(startedAt: Date, minutes: number): Date {
  const capped = Math.min(minutes, SUPPORT_SESSION_MAX_MINUTES);
  return new Date(startedAt.getTime() + capped * 60_000);
}

export function supportSessionState(
  session: SupportSessionFacts | null,
  token: { schoolId: string | null; userId: string },
  now: Date,
): 'active' | 'ended' {
  if (!session || session.endedAt !== null || session.expiresAt <= now) return 'ended';
  if (session.schoolId !== token.schoolId || session.platformAdminUserId !== token.userId) {
    return 'ended';
  }
  return 'active';
}

export function supportSessionSecondsLeft(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
