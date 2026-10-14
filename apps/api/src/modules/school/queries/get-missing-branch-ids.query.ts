import { Query } from '../../../kernel/cqrs/index.js';

export class GetMissingBranchIdsQuery extends Query<string[]> {
  constructor(readonly branchIds: readonly string[]) {
    super();
  }
}
