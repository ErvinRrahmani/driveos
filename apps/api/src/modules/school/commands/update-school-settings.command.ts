import type { UpdateSchoolSettingsRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdateSchoolSettingsCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly patch: UpdateSchoolSettingsRequest,
  ) {
    super();
  }
}
