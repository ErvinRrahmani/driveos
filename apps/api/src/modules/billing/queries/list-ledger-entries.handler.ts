import type { LedgerEntryType, LedgerListResponse } from '@driveos/shared';
import { sql } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { StudentAccess } from '../infra/student-access.js';
import { ListLedgerEntriesQuery } from './list-ledger-entries.query.js';

interface LedgerRow extends Record<string, unknown> {
  id: string;
  entry_type: LedgerEntryType;
  minutes: number;
  balance_after: number;
  lesson_id: string | null;
  payment_id: string | null;
  refund_id: string | null;
  price_item_id: string | null;
  note: string | null;
  created_by_membership_id: string | null;
  created_at: Date | string;
}

@QueryHandler(ListLedgerEntriesQuery)
export class ListLedgerEntriesHandler implements IQueryHandler<
  ListLedgerEntriesQuery,
  LedgerListResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
  ) {}

  async execute({ actor, studentId, params }: ListLedgerEntriesQuery): Promise<LedgerListResponse> {
    const id = await this.access.resolve(actor, studentId);
    const cursor = idCursor(params.cursor);
    const result = await this.tenant.tx.execute<LedgerRow>(sql`
      select * from (
        select id, entry_type, minutes, lesson_id, payment_id, refund_id, price_item_id, note,
               created_by_membership_id, created_at,
               (sum(minutes) over (order by id))::int as balance_after
          from ledger_entries
         where student_id = ${id}::uuid
      ) entries
      where (${cursor ?? null}::uuid is null or id < ${cursor ?? null}::uuid)
        and (${params.from ?? null}::timestamptz is null or created_at >= ${params.from ?? null}::timestamptz)
        and (${params.to ?? null}::timestamptz is null or created_at < ${params.to ?? null}::timestamptz)
      order by id desc
      limit ${params.limit + 1}`);
    const items = result.rows.map((row) => ({
      id: row.id,
      entryType: row.entry_type,
      minutes: Number(row.minutes),
      balanceAfter: Number(row.balance_after),
      lessonId: row.lesson_id,
      paymentId: row.payment_id,
      refundId: row.refund_id,
      priceItemId: row.price_item_id,
      note: row.note,
      createdByMembershipId: row.created_by_membership_id,
      createdAt: new Date(row.created_at).toISOString(),
    }));
    return pageOf(items, params.limit, (entry) => entry.id);
  }
}
