import type { MeResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetMeQuery extends Query<MeResponse> {
  constructor(
    readonly userId: string,
    readonly membershipId: string | null,
    readonly schoolId: string | null,
  ) {
    super();
  }
}
