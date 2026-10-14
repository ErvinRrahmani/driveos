import type {
  ListPriceItemsQuery as ListPriceItemsParams,
  PriceItemListResponse,
} from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListPriceItemsQuery extends Query<PriceItemListResponse> {
  constructor(readonly params: ListPriceItemsParams) {
    super();
  }
}
