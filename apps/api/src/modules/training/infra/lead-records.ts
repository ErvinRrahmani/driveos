import { Injectable } from '@nestjs/common';
import type { Lead, LeadListResponse, LeadStatus, ListLeadsQuery } from '@driveos/shared';
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lt, ne, or, sql } from 'drizzle-orm';
import { notFound } from '../../../kernel/http/errors.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { leads } from './schema.js';

export type LeadRow = typeof leads.$inferSelect;
export type NewLeadRow = typeof leads.$inferInsert;

const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    licenceClass: row.licenceClass,
    message: row.message,
    isMinor: row.isMinor,
    guardianName: row.guardianName,
    guardianContact: row.guardianContact,
    consentTextVersion: row.consentTextVersion,
    consentedAt: row.consentedAt.toISOString(),
    note: row.note,
    studentId: row.studentId,
    convertedAt: row.convertedAt?.toISOString() ?? null,
    lostAt: row.lostAt?.toISOString() ?? null,
    lostReason: row.lostReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Leads of the current school (RLS); training's own table. */
@Injectable()
export class LeadRecords {
  constructor(private readonly tenant: TenantContext) {}

  async find(id: string): Promise<LeadRow | null> {
    const [row] = await this.tenant.tx.select().from(leads).where(eq(leads.id, id));
    return row ?? null;
  }

  /** The leads converted into this student, oldest first (student export, anonymization). */
  ofStudent(studentId: string): Promise<LeadRow[]> {
    return this.tenant.tx
      .select()
      .from(leads)
      .where(eq(leads.studentId, studentId))
      .orderBy(asc(leads.id));
  }

  /** Deletes the leads converted into this student (a lead is not a financial record). */
  async deleteOfStudent(studentId: string): Promise<void> {
    await this.tenant.tx.delete(leads).where(eq(leads.studentId, studentId));
  }

  /** Locks a lead of the current school; 404 for an unknown id or another school's lead. */
  async lock(id: string): Promise<LeadRow> {
    const [row] = await this.tenant.tx.select().from(leads).where(eq(leads.id, id)).for('update');
    if (!row) throw notFound();
    return row;
  }

  /** Open leads created since `since` with the same phone or (lower-cased) email, locked. */
  async lockOpenByContact(
    contact: { phone: string | null; email: string | null },
    since: Date,
  ): Promise<LeadRow[]> {
    const byContact = [
      contact.phone !== null ? eq(leads.phone, contact.phone) : undefined,
      contact.email !== null ? sql`lower(${leads.email}) = ${contact.email}` : undefined,
    ].filter((clause) => clause !== undefined);
    if (byContact.length === 0) return [];
    return this.tenant.tx
      .select()
      .from(leads)
      .where(and(or(...byContact), gte(leads.createdAt, since), ne(leads.status, 'lost')))
      .for('update');
  }

  async insert(row: NewLeadRow): Promise<void> {
    await this.tenant.tx.insert(leads).values(row);
  }

  async update(id: string, changes: Partial<NewLeadRow>): Promise<void> {
    await this.tenant.tx.update(leads).set(changes).where(eq(leads.id, id));
  }

  /** Newest first (ids are UUIDv7), cursor = last lead id; `q` matches name, phone or email. */
  async page(params: ListLeadsQuery): Promise<LeadListResponse> {
    const cursor = idCursor(params.cursor);
    const pattern = params.q ? likePattern(params.q) : undefined;
    const rows = await this.tenant.tx
      .select()
      .from(leads)
      .where(
        and(
          cursor ? lt(leads.id, cursor) : undefined,
          params.status ? eq(leads.status, params.status) : undefined,
          pattern
            ? or(
                ilike(leads.fullName, pattern),
                ilike(leads.phone, pattern),
                ilike(leads.email, pattern),
              )
            : undefined,
        ),
      )
      .orderBy(desc(leads.id))
      .limit(params.limit + 1);
    return pageOf(rows.map(toLead), params.limit, (lead) => lead.id);
  }

  /**
   * Retention (design §8): closed leads (`lost`, `converted`) whose closing time, else creation, is
   * before `deleteClosedBefore` are deleted; IP hashes of leads created before `dropIpHashBefore`
   * are nulled.
   */
  async purge(cutoffs: {
    deleteClosedBefore: Date;
    dropIpHashBefore: Date;
  }): Promise<{ deleted: number; ipHashesCleared: number }> {
    const closed: LeadStatus[] = ['lost', 'converted'];
    const deleted = await this.tenant.tx
      .delete(leads)
      .where(
        and(
          inArray(leads.status, closed),
          lt(
            sql`coalesce(${leads.convertedAt}, ${leads.lostAt}, ${leads.createdAt})`,
            cutoffs.deleteClosedBefore,
          ),
        ),
      )
      .returning({ id: leads.id });
    const cleared = await this.tenant.tx
      .update(leads)
      .set({ requestIpHash: null })
      .where(and(isNotNull(leads.requestIpHash), lt(leads.createdAt, cutoffs.dropIpHashBefore)))
      .returning({ id: leads.id });
    return { deleted: deleted.length, ipHashesCleared: cleared.length };
  }
}
