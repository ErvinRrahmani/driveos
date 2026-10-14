import type { AvailabilityResponse, ReplaceAvailabilityRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class ReplaceAvailabilityCommand extends Command<AvailabilityResponse> {
  constructor(
    readonly actor: Principal,
    readonly instructorMembershipId: string,
    readonly body: ReplaceAvailabilityRequest,
  ) {
    super();
  }
}
