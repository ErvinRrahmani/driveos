import type { CheckoutResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../../adapters/payments/payment-provider.js';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { Purchases } from '../infra/purchases.js';
import { payments } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { StudentAccess } from '../infra/student-access.js';
import { StartCheckoutCommand } from './start-checkout.command.js';

@CommandHandler(StartCheckoutCommand)
export class StartCheckoutHandler implements ICommandHandler<
  StartCheckoutCommand,
  CheckoutResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
    private readonly school: SchoolFacts,
    private readonly purchases: Purchases,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async execute({ actor, body }: StartCheckoutCommand): Promise<CheckoutResponse> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Checkout needs a school scope');
    const studentId = await this.access.ownStudent(actor, body.studentId);
    const item = await this.purchases.priceItem(body.priceItemId);
    if (!item?.active) throw notFound();
    const account = await this.school.paymentAccount();
    if (account?.status !== 'active' || account.provider !== this.provider.name) {
      throw new ConflictError('checkout_disabled', t('errors.checkout_disabled'));
    }
    const paymentId = newId();
    const session = await this.provider.createCheckout({
      accountRef: account.accountRef,
      paymentId,
      amountMinor: item.amountMinor,
      currency: item.currency,
      description: item.name,
    });
    await this.tenant.tx.insert(payments).values({
      id: paymentId,
      schoolId,
      studentId,
      payerUserId: actor.userId,
      method: 'in_app',
      provider: this.provider.name,
      providerRef: session.providerRef,
      amountMinor: item.amountMinor,
      currency: item.currency,
      status: 'pending',
      priceItemId: item.id,
    });
    return { paymentId, checkoutUrl: session.checkoutUrl, provider: this.provider.name };
  }
}
