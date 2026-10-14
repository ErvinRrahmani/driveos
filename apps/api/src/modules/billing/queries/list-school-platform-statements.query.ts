import type {
  ListSchoolPlatformStatementsQuery as ListSchoolPlatformStatementsParams,
  PlatformStatementListResponse,
} from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListSchoolPlatformStatementsQuery extends Query<PlatformStatementListResponse> {
  constructor(readonly params: ListSchoolPlatformStatementsParams) {
    super();
  }
}
