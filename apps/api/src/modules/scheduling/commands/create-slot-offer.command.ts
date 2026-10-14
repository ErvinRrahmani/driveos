import type { CreateSlotOfferRequest, SlotOfferSource } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class CreateSlotOfferCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal | null,
    readonly body: CreateSlotOfferRequest,
    readonly source: SlotOfferSource,
  ) {
    super();
  }
}
