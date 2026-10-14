import type { ContractTemplateListResponse } from '@driveos/shared';
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { contractTemplates } from '../infra/schema.js';
import { ListContractTemplatesQuery } from './list-contract-templates.query.js';

@QueryHandler(ListContractTemplatesQuery)
export class ListContractTemplatesHandler implements IQueryHandler<
  ListContractTemplatesQuery,
  ContractTemplateListResponse
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ params }: ListContractTemplatesQuery): Promise<ContractTemplateListResponse> {
    const cursor = idCursor(params.cursor);
    const filters: (SQL | undefined)[] = [
      params.active ? eq(contractTemplates.active, params.active === 'true') : undefined,
      cursor ? lt(contractTemplates.id, cursor) : undefined,
    ];
    const rows = await this.tenant.tx
      .select()
      .from(contractTemplates)
      .where(and(...filters))
      .orderBy(desc(contractTemplates.id))
      .limit(params.limit + 1);
    const page = pageOf(rows, params.limit, (row) => row.id);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        name: row.name,
        version: row.version,
        body: row.body,
        active: row.active,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
