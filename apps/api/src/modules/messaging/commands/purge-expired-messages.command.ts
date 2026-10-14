import { Command } from '../../../kernel/cqrs/index.js';

export interface PurgedMessages {
  deleted: number;
}

export class PurgeExpiredMessagesCommand extends Command<PurgedMessages> {
  constructor(readonly now: Date) {
    super();
  }
}
