import { type LessonResponse, SlotOfferAccepted } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import {
  CommandBus,
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { ConflictError, invalidField, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { forbidden, SchedulingAccess } from '../infra/access.js';
import {
  SLOT_OFFER_CLOSED_VERSION,
  type SlotOfferRow,
  SlotOfferRecords,
} from '../infra/slot-offer-records.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { AcceptSlotOfferCommand } from './accept-slot-offer.command.js';
import { BookLessonCommand } from './book-lesson.command.js';

function offerUnavailable(): ConflictError {
  return new ConflictError('offer_unavailable', t('errors.offer_unavailable'));
}

@CommandHandler(AcceptSlotOfferCommand)
export class AcceptSlotOfferHandler implements ICommandHandler<
  AcceptSlotOfferCommand,
  LessonResponse
> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
    private readonly records: SlotOfferRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, offerId, body }: AcceptSlotOfferCommand): Promise<LessonResponse> {
    if (!actor.membershipId) throw forbidden();
    const offer = await this.records.find(offerId);
    if (!offer) throw notFound();
    const studentId = await this.studentFor(actor, offer, body.studentId);

    const taken = await this.records.take(offer.id, studentId);
    if (!taken) throw offerUnavailable();

    const lesson = await this.commandBus.execute(
      new BookLessonCommand(
        actor,
        {
          studentId,
          instructorMembershipId: taken.instructorMembershipId,
          vehicleId: taken.vehicleId,
          lessonTypeId: taken.lessonTypeId,
          start: taken.period.start.toISOString(),
        },
        undefined,
        'slot_offer',
      ),
    );
    await this.records.attachLesson(taken.id, lesson.id);
    await this.publisher.append([
      newEvent(SlotOfferAccepted, {
        aggregateType: 'slot_offer',
        aggregateId: taken.id,
        aggregateVersion: SLOT_OFFER_CLOSED_VERSION,
        payload: {
          offerId: taken.id,
          lessonId: lesson.id,
          studentId,
          instructorMembershipId: taken.instructorMembershipId,
          source: taken.source,
          start: lesson.start,
          end: lesson.end,
          creditMinutes: lesson.creditMinutes,
        },
      }),
    ]);
    return lesson;
  }

  private async studentFor(
    actor: Principal,
    offer: SlotOfferRow,
    requested: string | undefined,
  ): Promise<string> {
    if (await this.access.holdsAny(actor, ['slot_offers.manage'])) {
      if (!requested) throw invalidField(['studentId'], 'studentId is required for staff');
      return requested;
    }
    const own = await this.viewer.ownStudentIds(actor);
    if (requested) {
      if (!own.includes(requested)) throw forbidden();
      return requested;
    }
    const offered = own.filter((id) => offer.offeredToStudentIds.includes(id));
    if (offered.length > 1) {
      throw invalidField(['studentId'], 'choose which of your students accepts the offer');
    }
    const studentId = offered[0] ?? own[0];
    if (!studentId) throw forbidden();
    return studentId;
  }
}
