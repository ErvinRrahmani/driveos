import type { PriceItemListResponse } from '@driveos/shared';
import { and, asc, eq, gt } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { toPriceItem } from '../infra/price-item-records.js';
import { priceItems } from '../infra/schema.js';
import { ListPriceItemsQuery } from './list-price-items.query.js';

@QueryHandler(ListPriceItemsQuery)
export class ListPriceItemsHandler implements IQueryHandler<
  ListPriceItemsQuery,
  PriceItemListResponse
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ params }: ListPriceItemsQuery): Promise<PriceItemListResponse> {
    const cursor = idCursor(params.cursor);
    const rows = await this.tenant.tx
      .select()
      .from(priceItems)
      .where(
        and(
          cursor ? gt(priceItems.id, cursor) : undefined,
          params.kind ? eq(priceItems.kind, params.kind) : undefined,
          params.active ? eq(priceItems.active, params.active === 'true') : undefined,
        ),
      )
      .orderBy(asc(priceItems.id))
      .limit(params.limit + 1);
    return pageOf(rows.map(toPriceItem), params.limit, (item) => item.id);
  }
}
