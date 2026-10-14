import type { ListPlansQuery as ListPlansParams, PlanListResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListPlansQuery extends Query<PlanListResponse> {
  constructor(readonly params: ListPlansParams) {
    super();
  }
}
