import { randomUUID } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { Principal, TokenType } from './principal.js';

const ALGORITHM = 'HS256';

const claimsSchema = z.discriminatedUnion('typ', [
  z.object({
    typ: z.literal('access'),
    sub: z.uuid(),
    mid: z.uuid().nullable(),
    sid: z.uuid().nullable(),
    roles: z.array(z.string()),
  }),
  z.object({
    typ: z.literal('support'),
    sub: z.uuid(),
    mid: z.null(),
    sid: z.uuid(),
    roles: z.array(z.string()),
    support_session_id: z.uuid(),
  }),
]);

export type AccessTokenClaims = z.infer<typeof claimsSchema>;

export interface AccessTokenSubject {
  userId: string;
  membershipId: string | null;
  schoolId: string | null;
  roles: string[];
  tokenType?: TokenType;
  sessionId?: string | null;
}

export interface SignedAccessToken {
  token: string;
  expiresIn: number;
}

export type AccessTokenVerification =
  { ok: true; principal: Principal } | { ok: false; reason: 'expired' | 'invalid' };

export interface AccessTokenOptions {
  secret: string;
  ttlSeconds: number;
}

export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(private readonly options: AccessTokenOptions) {
    this.key = new TextEncoder().encode(options.secret);
  }

  async sign(
    subject: AccessTokenSubject,
    options: { ttlSeconds?: number } = {},
  ): Promise<SignedAccessToken> {
    const ttlSeconds = options.ttlSeconds ?? this.options.ttlSeconds;
    const tokenType = subject.tokenType ?? 'access';
    const claims: Record<string, unknown> = {
      mid: subject.membershipId,
      sid: subject.schoolId,
      roles: subject.roles,
      typ: tokenType,
    };
    if (tokenType === 'support') claims.support_session_id = subject.sessionId;
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(subject.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + ttlSeconds)
      .setJti(randomUUID())
      .sign(this.key);
    return { token, expiresIn: ttlSeconds };
  }

  async verify(token: string): Promise<AccessTokenVerification> {
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(token, this.key, { algorithms: [ALGORITHM] }));
    } catch (error) {
      return { ok: false, reason: error instanceof errors.JWTExpired ? 'expired' : 'invalid' };
    }
    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, reason: 'invalid' };
    const claims = parsed.data;
    return {
      ok: true,
      principal: {
        userId: claims.sub,
        membershipId: claims.mid,
        schoolId: claims.sid,
        roles: claims.roles,
        tokenType: claims.typ,
        sessionId: claims.typ === 'support' ? claims.support_session_id : null,
      },
    };
  }
}
