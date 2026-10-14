import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { supportSessions } from './schema.js';

export type SupportSessionRow = typeof supportSessions.$inferSelect;

@Injectable()
export class SupportSessionsRepository {
  constructor(private readonly tenant: TenantContext) {}

  async find(id: string): Promise<SupportSessionRow | null> {
    const [row] = await this.tenant.tx
      .select()
      .from(supportSessions)
      .where(eq(supportSessions.id, id));
    return row ?? null;
  }

  async insert(row: typeof supportSessions.$inferInsert): Promise<SupportSessionRow> {
    const [created] = await this.tenant.tx.insert(supportSessions).values(row).returning();
    if (!created) throw new Error('Support session insert returned no row');
    return created;
  }

  async end(id: string, endedAt: Date): Promise<SupportSessionRow | null> {
    const [row] = await this.tenant.tx
      .update(supportSessions)
      .set({ endedAt })
      .where(and(eq(supportSessions.id, id), isNull(supportSessions.endedAt)))
      .returning();
    return row ?? null;
  }
}
