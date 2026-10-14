import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function generateLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(pepper: string, value: string): string {
  return createHmac('sha256', pepper).update(value).digest('hex');
}

export function secretMatches(expectedHash: string, pepper: string, value: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(hashSecret(pepper, value), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}
