import { type EventPayload, StudentAnonymized } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { DeleteStudentReviewCommand } from '../commands/delete-student-review.command.js';

type Payload = EventPayload<typeof StudentAnonymized>;

/** Anonymizing a student deletes their review (design §4.3); repeat deliveries delete nothing. */
@Injectable()
@EventSubscriber({ name: 'school.review-anonymizer', events: [StudentAnonymized] })
export class StudentAnonymizedSubscriber implements EventHandler<Payload> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    await this.commandBus.execute(new DeleteStudentReviewCommand(payload.studentId));
  }
}
