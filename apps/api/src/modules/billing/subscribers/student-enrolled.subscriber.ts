import { type EventPayload, StudentEnrolled } from '@driveos/shared';
import { Injectable, Logger } from '@nestjs/common';
import { type DomainEvent, QueryBus } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { GetCurrentSubscriptionQuery } from '../../platform/index.js';
import { periodMonthOf } from '../domain/platform-fees.js';
import { PlatformChargeRecords } from '../infra/platform-charges.js';

type Payload = EventPayload<typeof StudentEnrolled>;

@Injectable()
@EventSubscriber({ name: 'billing.student-fee', events: [StudentEnrolled] })
export class StudentFeeSubscriber implements EventHandler<Payload> {
  private readonly logger = new Logger(StudentFeeSubscriber.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly charges: PlatformChargeRecords,
  ) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    const plan = await this.queryBus.execute(new GetCurrentSubscriptionQuery());
    if (!plan) {
      this.logger.warn({
        msg: 'student fee skipped: school has no current subscription',
        schoolId: event.schoolId,
        eventId: event.id,
      });
      return;
    }
    const charge = await this.charges.insertOncePerStudent({
      kind: 'student_fee',
      studentId: event.payload.studentId,
      periodMonth: periodMonthOf(new Date(event.occurredAt)),
      amountMinor: plan.studentFeeMinor,
      currency: plan.currency,
    });
    if (charge) await this.charges.announce([charge]);
  }
}
