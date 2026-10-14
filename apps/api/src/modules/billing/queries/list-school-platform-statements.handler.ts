import type { PlatformStatementListResponse } from '@driveos/shared';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { monthOf } from '../domain/platform-fees.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { platformStatements } from '../infra/schema.js';
import { ListSchoolPlatformStatementsQuery } from './list-school-platform-statements.query.js';

@QueryHandler(ListSchoolPlatformStatementsQuery)
export class ListSchoolPlatformStatementsHandler implements IQueryHandler<
  ListSchoolPlatformStatementsQuery,
  PlatformStatementListResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly school: SchoolFacts,
  ) {}

  async execute({
    params,
  }: ListSchoolPlatformStatementsQuery): Promise<PlatformStatementListResponse> {
    const cursor = idCursor(params.cursor);
    const filters: SQL[] = [];
    if (params.status) filters.push(eq(platformStatements.status, params.status));
    if (params.month) filters.push(eq(platformStatements.month, `${params.month}-01`));
    if (cursor) {
      filters.push(
        sql`(${platformStatements.month}, ${platformStatements.id}) <
            (select c.month, c.id from platform_statements c where c.id = ${cursor})`,
      );
    }
    const rows = await this.tenant.tx
      .select()
      .from(platformStatements)
      .where(and(...filters))
      .orderBy(desc(platformStatements.month), desc(platformStatements.id))
      .limit(params.limit + 1);
    const { name } = await this.school.profile();
    const items = rows.map((row) => ({
      id: row.id,
      schoolId: row.schoolId,
      schoolName: name,
      month: monthOf(row.month),
      totalMinor: row.totalMinor,
      currency: row.currency,
      status: row.status,
      issuedAt: row.issuedAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      paidMethod: row.paidMethod,
      paidReference: row.paidReference,
      markedPaidByUserId: row.markedPaidByUserId,
    }));
    return pageOf(items, params.limit, (item) => item.id);
  }
}
