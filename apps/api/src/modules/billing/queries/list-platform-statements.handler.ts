import type { PlatformStatementListResponse } from '@driveos/shared';
import { sql } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { ListPlatformStatementsQuery } from './list-platform-statements.query.js';

interface StatementRow extends Record<string, unknown> {
  statement_id: string;
  school_id: string;
  school_name: string;
  month: string;
  total_minor: string;
  currency: string;
  status: 'issued' | 'paid';
  issued_at: Date;
  paid_at: Date | null;
  paid_method: 'bank_transfer' | 'cash' | null;
  paid_reference: string | null;
  marked_paid_by_user_id: string | null;
}

@QueryHandler(ListPlatformStatementsQuery)
export class ListPlatformStatementsHandler implements IQueryHandler<
  ListPlatformStatementsQuery,
  PlatformStatementListResponse
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ params }: ListPlatformStatementsQuery): Promise<PlatformStatementListResponse> {
    const cursor = idCursor(params.cursor) ?? null;
    const month = params.month ? `${params.month}-01` : null;
    const { rows } = await this.tenant.tx.execute<StatementRow>(
      sql`select * from platform_list_statements(${params.status ?? null}, ${params.schoolId ?? null}::uuid,
            ${month}::date, ${cursor}::uuid, ${params.limit + 1})`,
    );
    const items = rows.map((row) => ({
      id: row.statement_id,
      schoolId: row.school_id,
      schoolName: row.school_name,
      month: String(row.month).slice(0, 7),
      totalMinor: Number(row.total_minor),
      currency: row.currency,
      status: row.status,
      issuedAt: new Date(row.issued_at).toISOString(),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      paidMethod: row.paid_method,
      paidReference: row.paid_reference,
      markedPaidByUserId: row.marked_paid_by_user_id,
    }));
    return pageOf(items, params.limit, (item) => item.id);
  }
}
