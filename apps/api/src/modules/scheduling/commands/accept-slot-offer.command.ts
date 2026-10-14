import type { AcceptSlotOfferRequest, LessonResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class AcceptSlotOfferCommand extends Command<LessonResponse> {
  constructor(
    readonly actor: Principal,
    readonly offerId: string,
    readonly body: AcceptSlotOfferRequest,
  ) {
    super();
  }
}
