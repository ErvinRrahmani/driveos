import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { overlaps } from '../domain/period.js';
import { SLOT_OFFER_MIN_LEAD_MS } from '../domain/slot-offers.js';
import { LessonRecords } from '../infra/lesson-records.js';
import { type CreatedSlotOffer, SlotOfferCreator } from '../infra/slot-offer-creator.js';
import { SlotOfferRecords } from '../infra/slot-offer-records.js';
import { OfferCancelledSlotCommand } from './offer-cancelled-slot.command.js';

@CommandHandler(OfferCancelledSlotCommand)
export class OfferCancelledSlotHandler implements ICommandHandler<
  OfferCancelledSlotCommand,
  CreatedSlotOffer | null
> {
  constructor(
    private readonly lessons: LessonRecords,
    private readonly offers: SlotOfferRecords,
    private readonly creator: SlotOfferCreator,
  ) {}

  async execute({
    lessonId,
    cancellingStudentId,
    now,
  }: OfferCancelledSlotCommand): Promise<CreatedSlotOffer | null> {
    const lesson = await this.lessons.byId(lessonId);
    if (!lesson || lesson.status !== 'cancelled') return null;
    const { period, instructorMembershipId, vehicleId } = lesson;
    if (period.start.getTime() - now.getTime() <= SLOT_OFFER_MIN_LEAD_MS) return null;

    await this.offers.lockInstructor(instructorMembershipId);
    const instructorBusy = (
      await this.lessons.busyByInstructor([instructorMembershipId], period)
    ).get(instructorMembershipId);
    if (instructorBusy?.some((busy) => overlaps(busy, period))) return null;
    if (await this.offers.hasOpenOverlapping(instructorMembershipId, period, now)) return null;

    return this.creator.createIfStillValid({
      instructorMembershipId,
      vehicleId,
      lessonTypeId: lesson.lessonTypeId,
      start: period.start,
      source: 'cancellation',
      excludeStudentIds: [cancellingStudentId],
      now,
    });
  }
}
