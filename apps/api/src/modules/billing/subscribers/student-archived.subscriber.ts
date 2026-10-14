import { type EventPayload, StudentArchived } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { periodMonthOf, reversalAllowed } from '../domain/platform-fees.js';
import { PlatformChargeRecords } from '../infra/platform-charges.js';

type Payload = EventPayload<typeof StudentArchived>;

@Injectable()
@EventSubscriber({ name: 'billing.student-fee-reversal', events: [StudentArchived] })
export class StudentFeeReversalSubscriber implements EventHandler<Payload> {
  constructor(private readonly charges: PlatformChargeRecords) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    const { studentId, completedLessons } = event.payload;
    const archivedAt = new Date(event.payload.archivedAt);
    const fee = await this.charges.studentFee(studentId);
    if (!fee) return;
    if (!reversalAllowed({ chargedAt: fee.createdAt, archivedAt, completedLessons })) return;
    const reversal = await this.charges.insertOncePerStudent({
      kind: 'student_fee_reversal',
      studentId,
      periodMonth: periodMonthOf(archivedAt),
      amountMinor: -fee.amountMinor,
      currency: fee.currency,
    });
    if (reversal) await this.charges.announce([reversal]);
  }
}
