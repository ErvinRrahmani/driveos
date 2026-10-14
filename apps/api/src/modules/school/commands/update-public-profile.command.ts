import type { UpdatePublicProfileRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

/** Creates or changes the school's public page profile; `id` of the result is the school id. */
export class UpdatePublicProfileCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly body: UpdatePublicProfileRequest,
  ) {
    super();
  }
}
