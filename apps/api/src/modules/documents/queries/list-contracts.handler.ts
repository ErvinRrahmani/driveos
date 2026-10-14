import type { ContractListResponse } from '@driveos/shared';
import { and, desc, eq, inArray, lt, type SQL } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { ContractViews } from '../infra/contract-views.js';
import { DocumentAccess } from '../infra/document-access.js';
import { contracts } from '../infra/schema.js';
import { ListContractsQuery } from './list-contracts.query.js';

@QueryHandler(ListContractsQuery)
export class ListContractsHandler implements IQueryHandler<
  ListContractsQuery,
  ContractListResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: DocumentAccess,
    private readonly views: ContractViews,
  ) {}

  async execute({ actor, params }: ListContractsQuery): Promise<ContractListResponse> {
    const scope = await this.access.contracts(actor);
    if (params.studentId && scope !== 'all' && !scope.has(params.studentId)) throw notFound();
    if (scope !== 'all' && scope.size === 0) return { items: [], nextCursor: null };
    const cursor = idCursor(params.cursor);
    const filters: (SQL | undefined)[] = [
      scope === 'all' ? undefined : inArray(contracts.studentId, [...scope]),
      params.studentId ? eq(contracts.studentId, params.studentId) : undefined,
      params.status ? eq(contracts.status, params.status) : undefined,
      cursor ? lt(contracts.id, cursor) : undefined,
    ];
    const rows = await this.tenant.tx
      .select()
      .from(contracts)
      .where(and(...filters))
      .orderBy(desc(contracts.id))
      .limit(params.limit + 1);
    const page = pageOf(rows, params.limit, (row) => row.id);
    return { items: await this.views.summaries(page.items), nextCursor: page.nextCursor };
  }
}
