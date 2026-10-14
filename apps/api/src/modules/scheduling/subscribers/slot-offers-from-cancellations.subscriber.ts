import { type EventPayload, LessonCancelled } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { OfferCancelledSlotCommand } from '../commands/offer-cancelled-slot.command.js';

type Payload = EventPayload<typeof LessonCancelled>;

@Injectable()
@EventSubscriber({
  name: 'scheduling.slot-offers-from-cancellations',
  events: [LessonCancelled],
})
export class SlotOffersFromCancellationsSubscriber implements EventHandler<Payload> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    await this.commandBus.execute(
      new OfferCancelledSlotCommand(payload.lessonId, payload.studentId, new Date()),
    );
  }
}
