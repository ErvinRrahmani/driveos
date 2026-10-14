import { and, asc, eq } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { priceItems } from '../infra/schema.js';
import {
  ListPublicPriceItemsQuery,
  type PublicPriceItem,
} from './list-public-price-items.query.js';

@QueryHandler(ListPublicPriceItemsQuery)
export class ListPublicPriceItemsHandler implements IQueryHandler<
  ListPublicPriceItemsQuery,
  PublicPriceItem[]
> {
  constructor(private readonly tenant: TenantContext) {}

  execute(): Promise<PublicPriceItem[]> {
    return this.tenant.tx
      .select({
        id: priceItems.id,
        name: priceItems.name,
        kind: priceItems.kind,
        amountMinor: priceItems.amountMinor,
        currency: priceItems.currency,
        creditMinutes: priceItems.creditMinutes,
      })
      .from(priceItems)
      .where(and(eq(priceItems.active, true), eq(priceItems.showOnPublicPage, true)))
      .orderBy(asc(priceItems.sortOrder), asc(priceItems.name));
  }
}
