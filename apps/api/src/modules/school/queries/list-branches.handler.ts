import type { BranchListResponse } from '@driveos/shared';
import { asc, gt } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { toBranch } from '../infra/school-records.js';
import { branches } from '../infra/schema.js';
import { ListBranchesQuery } from './list-branches.query.js';

@QueryHandler(ListBranchesQuery)
export class ListBranchesHandler implements IQueryHandler<ListBranchesQuery, BranchListResponse> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ params }: ListBranchesQuery): Promise<BranchListResponse> {
    const cursor = idCursor(params.cursor);
    const rows = await this.tenant.tx
      .select()
      .from(branches)
      .where(cursor ? gt(branches.id, cursor) : undefined)
      .orderBy(asc(branches.id))
      .limit(params.limit + 1);
    return pageOf(rows.map(toBranch), params.limit, (branch) => branch.id);
  }
}
