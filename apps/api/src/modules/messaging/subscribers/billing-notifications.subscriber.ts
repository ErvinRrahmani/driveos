import { type EventPayload, InvoiceIssued, PlatformStatementIssued } from '@driveos/shared';
import { Inject, Injectable } from '@nestjs/common';
import { INVOICE_POLICY, type InvoicePolicy } from '../../../adapters/invoices/invoice-policy.js';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';
import { StudentAudience } from '../infra/student-audience.js';

type Payload = EventPayload<typeof InvoiceIssued> | EventPayload<typeof PlatformStatementIssued>;

@Injectable()
@EventSubscriber({
  name: 'messaging.billing-notifications',
  events: [InvoiceIssued, PlatformStatementIssued],
})
export class BillingNotificationsSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly audience: StudentAudience,
    @Inject(INVOICE_POLICY) private readonly invoicePolicy: InvoicePolicy,
  ) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    if ('statementId' in payload) {
      await this.commandBus.execute(
        new SendNotificationCommand({
          recipients: { userIds: payload.ownerUserIds },
          template: 'platform_statement_issued',
          payload: {
            statementId: payload.statementId,
            month: payload.month,
            totalMinor: payload.totalMinor,
            currency: payload.currency,
          },
          timing: 'deferred',
        }),
      );
      return;
    }
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: {
          userIds: payload.payerUserIds ?? (await this.audience.userIdsOf(payload.studentId)),
        },
        template: 'invoice_issued',
        payload: {
          invoiceId: payload.invoiceId,
          number: this.invoicePolicy.formatNumber(payload.series, payload.number),
          totalMinor: payload.totalMinor,
          currency: payload.currency,
        },
        timing: 'deferred',
      }),
    );
  }
}
