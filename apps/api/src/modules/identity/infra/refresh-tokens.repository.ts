import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { RefreshClient } from '../domain/refresh-token.js';
import { refreshTokens } from './schema.js';

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  membershipId: string | null;
  client: RefreshClient;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly tenant: TenantContext) {}

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const rows = await this.tenant.tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<RefreshTokenRow | null> {
    const rows = await this.tenant.tx.select().from(refreshTokens).where(eq(refreshTokens.id, id));
    return rows[0] ?? null;
  }

  async lockFamily(familyId: string): Promise<void> {
    await this.tenant.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('refresh_tokens.family'), hashtext(${familyId}))`,
    );
  }

  async insert(token: NewRefreshToken): Promise<string> {
    const id = newId();
    await this.tenant.tx.insert(refreshTokens).values({ id, ...token });
    return id;
  }

  async markRotated(id: string, successorId: string, now: Date): Promise<void> {
    await this.tenant.tx
      .update(refreshTokens)
      .set({ rotatedAt: now, successorId })
      .where(eq(refreshTokens.id, id));
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.tenant.tx
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllOfUser(userId: string, now: Date): Promise<void> {
    await this.tenant.tx
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  async revokeFamiliesOfMembership(membershipId: string, now: Date): Promise<void> {
    await this.tenant.tx
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          isNull(refreshTokens.revokedAt),
          inArray(
            refreshTokens.familyId,
            this.tenant.tx
              .select({ familyId: refreshTokens.familyId })
              .from(refreshTokens)
              .where(eq(refreshTokens.membershipId, membershipId)),
          ),
        ),
      );
  }
}
