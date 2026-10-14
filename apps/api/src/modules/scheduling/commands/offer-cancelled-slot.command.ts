import { Command } from '../../../kernel/cqrs/index.js';
import type { CreatedSlotOffer } from '../infra/slot-offer-creator.js';

export class OfferCancelledSlotCommand extends Command<CreatedSlotOffer | null> {
  constructor(
    readonly lessonId: string,
    readonly cancellingStudentId: string,
    readonly now: Date,
  ) {
    super();
  }
}
