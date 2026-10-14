import { Command } from '../../../kernel/cqrs/index.js';

export interface PurgedLeads {
  deleted: number;
  ipHashesCleared: number;
}

/**
 * Lead retention for the current school (design §8): deletes `lost` and `converted` leads closed
 * more than 12 months before `now` and nulls `request_ip_hash` after 30 days. No events.
 */
export class PurgeLeadsCommand extends Command<PurgedLeads> {
  constructor(readonly now: Date) {
    super();
  }
}
