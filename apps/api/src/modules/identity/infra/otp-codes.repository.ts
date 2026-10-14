import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { otpCodes } from './schema.js';

export interface OtpCodeRow {
  id: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
}

@Injectable()
export class OtpCodesRepository {
  constructor(private readonly tenant: TenantContext) {}

  async replace(contact: string, codeHash: string, expiresAt: Date, now: Date): Promise<void> {
    await this.tenant.tx
      .update(otpCodes)
      .set({ expiresAt: now })
      .where(
        and(
          eq(otpCodes.contact, contact),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, now),
        ),
      );
    await this.tenant.tx
      .insert(otpCodes)
      .values({ id: newId(), contact, codeHash, attempts: 0, expiresAt });
  }

  async latestUnconsumedForUpdate(contact: string): Promise<OtpCodeRow | null> {
    const rows = await this.tenant.tx
      .select({
        id: otpCodes.id,
        codeHash: otpCodes.codeHash,
        attempts: otpCodes.attempts,
        expiresAt: otpCodes.expiresAt,
      })
      .from(otpCodes)
      .where(and(eq(otpCodes.contact, contact), isNull(otpCodes.consumedAt)))
      .orderBy(desc(otpCodes.createdAt), desc(otpCodes.id))
      .limit(1)
      .for('update');
    return rows[0] ?? null;
  }

  async recordAttempt(id: string, attempts: number): Promise<void> {
    await this.tenant.tx.update(otpCodes).set({ attempts }).where(eq(otpCodes.id, id));
  }

  async consume(id: string, now: Date): Promise<void> {
    await this.tenant.tx.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, id));
  }
}
