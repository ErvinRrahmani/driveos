import { Command } from '../../../kernel/cqrs/index.js';

export class ExpireSlotOffersCommand extends Command<{ expired: number }> {
  constructor(readonly now: Date) {
    super();
  }
}
