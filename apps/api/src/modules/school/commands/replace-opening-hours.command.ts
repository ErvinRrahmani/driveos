import type { OpeningHoursResponse, ReplaceOpeningHoursRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class ReplaceOpeningHoursCommand extends Command<OpeningHoursResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: ReplaceOpeningHoursRequest,
  ) {
    super();
  }
}
