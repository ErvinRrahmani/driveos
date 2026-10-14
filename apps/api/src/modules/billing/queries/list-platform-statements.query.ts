import type {
  ListPlatformStatementsQuery as ListPlatformStatementsParams,
  PlatformStatementListResponse,
} from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListPlatformStatementsQuery extends Query<PlatformStatementListResponse> {
  constructor(readonly params: ListPlatformStatementsParams) {
    super();
  }
}
