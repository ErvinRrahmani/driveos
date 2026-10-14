import type { PriceItemKind } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export interface PublicPriceItem {
  id: string;
  name: string;
  kind: PriceItemKind;
  amountMinor: number;
  currency: string;
  creditMinutes: number | null;
}

export class ListPublicPriceItemsQuery extends Query<PublicPriceItem[]> {}
