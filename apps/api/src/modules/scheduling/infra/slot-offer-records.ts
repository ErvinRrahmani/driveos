import type { SlotOfferSource, SlotOfferStatus } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, getTableColumns, gt, lte, sql } from 'drizzle-orm';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { Period } from '../domain/period.js';
import { lessonTypes, slotOffers } from './schema.js';
import { schoolIdOf } from './tenant.js';

export type SlotOfferRow = typeof slotOffers.$inferSelect;
export type SlotOfferListRow = SlotOfferRow & { lessonTypeName: string; creditMinutes: number };

export interface NewSlotOffer {
  instructorMembershipId: string;
  vehicleId: string | null;
  lessonTypeId: string;
  period: Period;
  source: SlotOfferSource;
  offeredToStudentIds: readonly string[];
  expiresAt: Date;
}

export interface SlotOfferPageFilter {
  offeredTo: 'all' | readonly string[];
  status?: SlotOfferStatus;
  openOnlyIfUnexpired: boolean;
  after?: { start: Date; id: string };
  limit: number;
}

export const SLOT_OFFER_CREATED_VERSION = 1;
export const SLOT_OFFER_CLOSED_VERSION = 2;

function uuidArray(ids: readonly string[]) {
  return sql`array[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
}

@Injectable()
export class SlotOfferRecords {
  constructor(private readonly tenant: TenantContext) {}

  async insert(offer: NewSlotOffer): Promise<SlotOfferRow> {
    const [row] = await this.tenant.tx
      .insert(slotOffers)
      .values({
        id: newId(),
        schoolId: schoolIdOf(this.tenant),
        instructorMembershipId: offer.instructorMembershipId,
        vehicleId: offer.vehicleId,
        lessonTypeId: offer.lessonTypeId,
        period: offer.period,
        source: offer.source,
        offeredToStudentIds: [...offer.offeredToStudentIds],
        expiresAt: offer.expiresAt,
        status: 'open',
      })
      .returning();
    if (!row) throw new Error('Slot offer insert returned no row');
    return row;
  }

  async lockInstructor(instructorMembershipId: string): Promise<void> {
    await this.tenant.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('slot_offer'), hashtext(${instructorMembershipId}::text))`,
    );
  }

  async hasOpenOverlapping(
    instructorMembershipId: string,
    period: Period,
    now: Date,
  ): Promise<boolean> {
    const [row] = await this.tenant.tx
      .select({ id: slotOffers.id })
      .from(slotOffers)
      .where(
        and(
          eq(slotOffers.instructorMembershipId, instructorMembershipId),
          eq(slotOffers.status, 'open'),
          gt(slotOffers.expiresAt, now),
          sql`${slotOffers.period} && tstzrange(${period.start.toISOString()}::timestamptz, ${period.end.toISOString()}::timestamptz, '[)')`,
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async countOpen(
    instructorMembershipId: string,
    source: SlotOfferSource,
    now: Date,
  ): Promise<number> {
    const [row] = await this.tenant.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(slotOffers)
      .where(
        and(
          eq(slotOffers.instructorMembershipId, instructorMembershipId),
          eq(slotOffers.source, source),
          eq(slotOffers.status, 'open'),
          gt(slotOffers.expiresAt, now),
        ),
      );
    return row?.count ?? 0;
  }

  async find(id: string): Promise<SlotOfferRow | null> {
    const [row] = await this.tenant.tx.select().from(slotOffers).where(eq(slotOffers.id, id));
    return row ?? null;
  }

  async take(id: string, studentId: string): Promise<SlotOfferRow | null> {
    const [row] = await this.tenant.tx
      .update(slotOffers)
      .set({ status: 'taken', acceptedByStudentId: studentId })
      .where(
        and(
          eq(slotOffers.id, id),
          eq(slotOffers.status, 'open'),
          sql`${slotOffers.expiresAt} > now()`,
          sql`${studentId}::uuid = any(${slotOffers.offeredToStudentIds})`,
        ),
      )
      .returning();
    return row ?? null;
  }

  async attachLesson(id: string, lessonId: string): Promise<void> {
    await this.tenant.tx.update(slotOffers).set({ lessonId }).where(eq(slotOffers.id, id));
  }

  expireDue(now: Date): Promise<SlotOfferRow[]> {
    return this.tenant.tx
      .update(slotOffers)
      .set({ status: 'expired' })
      .where(and(eq(slotOffers.status, 'open'), lte(slotOffers.expiresAt, now)))
      .returning();
  }

  async page(filter: SlotOfferPageFilter): Promise<SlotOfferListRow[]> {
    if (filter.offeredTo !== 'all' && filter.offeredTo.length === 0) return [];
    return this.tenant.tx
      .select({
        ...getTableColumns(slotOffers),
        lessonTypeName: lessonTypes.name,
        creditMinutes: lessonTypes.creditMinutes,
      })
      .from(slotOffers)
      .innerJoin(lessonTypes, eq(lessonTypes.id, slotOffers.lessonTypeId))
      .where(
        and(
          filter.offeredTo === 'all'
            ? undefined
            : sql`${slotOffers.offeredToStudentIds} && ${uuidArray(filter.offeredTo)}`,
          filter.status ? eq(slotOffers.status, filter.status) : undefined,
          filter.status === 'open' && filter.openOnlyIfUnexpired
            ? gt(slotOffers.expiresAt, sql`now()`)
            : undefined,
          filter.after
            ? sql`(lower(${slotOffers.period}), ${slotOffers.id}) > (${filter.after.start.toISOString()}::timestamptz, ${filter.after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(sql`lower(${slotOffers.period})`, asc(slotOffers.id))
      .limit(filter.limit + 1);
  }
}
