import type { ConvertLeadRequest, ConvertLeadResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

/**
 * Turns a lead into a student in one transaction: `CreateStudentCommand` with the lead's name and
 * licence class, an optional student invitation to the lead's contact and, for a minor, an
 * optional parent invitation through `LinkGuardianCommand`. 404 for an unknown lead,
 * `409 lead_already_converted` when it was converted before.
 */
export class ConvertLeadCommand extends Command<ConvertLeadResponse> {
  constructor(
    readonly actor: Principal,
    readonly leadId: string,
    readonly body: ConvertLeadRequest,
  ) {
    super();
  }
}
