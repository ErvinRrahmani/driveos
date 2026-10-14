import type { UpdatePriceItemRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdatePriceItemCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly priceItemId: string,
    readonly patch: UpdatePriceItemRequest,
  ) {
    super();
  }
}
