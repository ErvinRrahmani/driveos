export const LOGIN_CODE_TTL_MS = 5 * 60_000;
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

export interface StoredLoginCode {
  attempts: number;
  expiresAt: Date;
}

export type LoginCodeCheck =
  | { outcome: 'accepted' }
  | { outcome: 'wrong'; attempts: number }
  | { outcome: 'expired' }
  | { outcome: 'invalid' };

export function loginCodeExpiry(now: Date): Date {
  return new Date(now.getTime() + LOGIN_CODE_TTL_MS);
}

export function checkLoginCode(
  stored: StoredLoginCode | null,
  matches: boolean,
  now: Date,
): LoginCodeCheck {
  if (!stored || stored.attempts >= LOGIN_CODE_MAX_ATTEMPTS) return { outcome: 'invalid' };
  if (stored.expiresAt.getTime() <= now.getTime()) return { outcome: 'expired' };
  if (matches) return { outcome: 'accepted' };
  return { outcome: 'wrong', attempts: stored.attempts + 1 };
}

export interface LoginCodeCounts {
  contact: number;
  ip: number;
  prefix: number | null;
}

export interface LoginCodeLimits {
  perContact: number;
  perIp: number;
  perPrefixPerDay: number;
}

export type LoginCodeLimit = 'contact' | 'ip' | 'prefix';

export function loginCodeLimitReason(
  counts: LoginCodeCounts,
  limits: LoginCodeLimits,
): LoginCodeLimit | null {
  if (counts.contact > limits.perContact) return 'contact';
  if (counts.ip > limits.perIp) return 'ip';
  if (counts.prefix !== null && counts.prefix >= limits.perPrefixPerDay) return 'prefix';
  return null;
}
