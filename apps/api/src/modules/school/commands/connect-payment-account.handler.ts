import { Inject } from '@nestjs/common';
import { type ConnectPaymentAccountResponse, PaymentAccountConnected } from '@driveos/shared';
import { sql } from 'drizzle-orm';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../../adapters/payments/payment-provider.js';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { SchoolRecords } from '../infra/school-records.js';
import { schoolPaymentAccounts } from '../infra/schema.js';
import { ConnectPaymentAccountCommand } from './connect-payment-account.command.js';

@CommandHandler(ConnectPaymentAccountCommand)
export class ConnectPaymentAccountHandler implements ICommandHandler<
  ConnectPaymentAccountCommand,
  ConnectPaymentAccountResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: SchoolRecords,
    private readonly publisher: EventPublisher,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async execute({ body }: ConnectPaymentAccountCommand): Promise<ConnectPaymentAccountResponse> {
    if (body.provider !== this.provider.name) {
      throw invalidField(['provider'], `Unknown payment provider; use '${this.provider.name}'`);
    }
    const schoolId = this.records.schoolId;
    const connected = await this.provider.connectAccount({
      schoolId,
      returnUrl: body.returnUrl ?? null,
    });
    const [row] = await this.tenant.tx
      .insert(schoolPaymentAccounts)
      .values({
        schoolId,
        provider: this.provider.name,
        accountRef: connected.accountRef,
        status: connected.status,
      })
      .onConflictDoUpdate({
        target: [schoolPaymentAccounts.schoolId, schoolPaymentAccounts.provider],
        set: {
          accountRef: connected.accountRef,
          status: connected.status,
          version: sql`${schoolPaymentAccounts.version} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error('Payment account upsert returned no row');
    await this.publisher.append([
      newEvent(PaymentAccountConnected, {
        aggregateType: 'payment_account',
        aggregateId: row.id,
        aggregateVersion: row.version,
        payload: {
          accountId: row.id,
          provider: row.provider,
          accountRef: row.accountRef,
          status: row.status,
        },
      }),
    ]);
    return {
      id: row.id,
      version: row.version,
      provider: row.provider,
      status: row.status,
      onboardingUrl: connected.onboardingUrl,
    };
  }
}
