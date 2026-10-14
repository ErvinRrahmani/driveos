import { SlotOfferExpired } from '@driveos/shared';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { SLOT_OFFER_CLOSED_VERSION, SlotOfferRecords } from '../infra/slot-offer-records.js';
import { ExpireSlotOffersCommand } from './expire-slot-offers.command.js';

@CommandHandler(ExpireSlotOffersCommand)
export class ExpireSlotOffersHandler implements ICommandHandler<
  ExpireSlotOffersCommand,
  { expired: number }
> {
  constructor(
    private readonly records: SlotOfferRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ now }: ExpireSlotOffersCommand): Promise<{ expired: number }> {
    const expired = await this.records.expireDue(now);
    await this.publisher.append(
      expired.map((offer) =>
        newEvent(SlotOfferExpired, {
          aggregateType: 'slot_offer',
          aggregateId: offer.id,
          aggregateVersion: SLOT_OFFER_CLOSED_VERSION,
          payload: {
            offerId: offer.id,
            instructorMembershipId: offer.instructorMembershipId,
            source: offer.source,
            start: offer.period.start.toISOString(),
            end: offer.period.end.toISOString(),
            offeredToStudentIds: offer.offeredToStudentIds,
            expiredAt: now.toISOString(),
          },
        }),
      ),
    );
    return { expired: expired.length };
  }
}
