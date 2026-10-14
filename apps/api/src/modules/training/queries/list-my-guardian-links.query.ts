import type { GuardianLinkListResponse, ListGuardianLinksQuery } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListMyGuardianLinksQuery extends Query<GuardianLinkListResponse> {
  constructor(
    readonly guardianUserId: string,
    readonly params: ListGuardianLinksQuery,
  ) {
    super();
  }
}
