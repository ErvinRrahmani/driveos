import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { SchoolRecords } from '../infra/school-records.js';
import { GetMissingBranchIdsQuery } from './get-missing-branch-ids.query.js';

@QueryHandler(GetMissingBranchIdsQuery)
export class GetMissingBranchIdsHandler implements IQueryHandler<
  GetMissingBranchIdsQuery,
  string[]
> {
  constructor(private readonly records: SchoolRecords) {}

  execute({ branchIds }: GetMissingBranchIdsQuery): Promise<string[]> {
    return this.records.missingBranchIds(branchIds);
  }
}
