import { type EventPayload, InstructorAssigned, StudentCreated } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { conversations } from '../infra/schema.js';

type Payload = EventPayload<typeof StudentCreated> | EventPayload<typeof InstructorAssigned>;

@Injectable()
@EventSubscriber({ name: 'messaging.conversations', events: [StudentCreated, InstructorAssigned] })
export class ConversationsSubscriber implements EventHandler<Payload> {
  constructor(private readonly tenant: TenantContext) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Opening a conversation needs a school scope');
    const instructorMembershipId =
      'instructorMembershipId' in event.payload ? event.payload.instructorMembershipId : null;
    await this.tenant.tx
      .insert(conversations)
      .values({
        id: newId(),
        schoolId,
        kind: instructorMembershipId ? 'student_instructor' : 'student_school',
        studentId: event.payload.studentId,
        instructorMembershipId,
      })
      .onConflictDoNothing();
  }
}
