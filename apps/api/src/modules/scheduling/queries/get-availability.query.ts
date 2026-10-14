import type { AvailabilityResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetAvailabilityQuery extends Query<AvailabilityResponse> {
  constructor(
    readonly actor: Principal,
    readonly instructorMembershipId: string,
  ) {
    super();
  }
}
