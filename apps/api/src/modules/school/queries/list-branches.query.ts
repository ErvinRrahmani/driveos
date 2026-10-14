import type { BranchListResponse, ListBranchesQuery as ListBranchesParams } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListBranchesQuery extends Query<BranchListResponse> {
  constructor(readonly params: ListBranchesParams) {
    super();
  }
}
