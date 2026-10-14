import { PaymentFailed, PaymentSucceeded, type PaymentWebhookResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type PaymentWebhookEvent,
} from '../../../adapters/payments/payment-provider.js';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { webhookTransition } from '../domain/payment-rules.js';
import { InvoiceIssuer } from '../infra/invoice-issuer.js';
import { LEDGER_WRITER, type LedgerWriter } from '../infra/ledger-writer.js';
import { PAYMENT_AGGREGATE, type PaymentRow, purchasePayload } from '../infra/payment-events.js';
import { PaymentWebhookFailures } from '../infra/payment-webhook-failures.js';
import { Purchases } from '../infra/purchases.js';
import { payments } from '../infra/schema.js';
import { HandlePaymentWebhookCommand } from './handle-payment-webhook.command.js';
import { StatusCodes } from 'http-status-codes';

const unknownPayment = () =>
  new ApiError(StatusCodes.NOT_FOUND, 'unknown_payment', t('errors.unknown_payment'));

@CommandHandler(HandlePaymentWebhookCommand)
export class HandlePaymentWebhookHandler implements ICommandHandler<
  HandlePaymentWebhookCommand,
  PaymentWebhookResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly publisher: EventPublisher,
    private readonly invoices: InvoiceIssuer,
    private readonly purchases: Purchases,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly failures: PaymentWebhookFailures,
  ) {}

  async execute(command: HandlePaymentWebhookCommand): Promise<PaymentWebhookResponse> {
    const seen: { schoolId: string | null; providerRef: string | null } = {
      schoolId: null,
      providerRef: null,
    };
    try {
      return await this.receive(command, seen);
    } catch (error) {
      await this.failures.record({ ...seen, provider: command.provider, error });
      throw error;
    }
  }

  private async receive(
    { provider, rawBody, headers }: HandlePaymentWebhookCommand,
    seen: { schoolId: string | null; providerRef: string | null },
  ): Promise<PaymentWebhookResponse> {
    if (provider !== this.provider.name) throw notFound();
    const event = this.provider.verifyWebhook(rawBody, headers);
    if (!event)
      throw new ApiError(
        StatusCodes.UNAUTHORIZED,
        'invalid_signature',
        t('errors.invalid_signature'),
      );
    seen.providerRef = event.providerRef;
    const schoolId = await this.tenant.runInTenant({ schoolId: null, userId: null }, async () => {
      const result = await this.tenant.tx.execute<{ school_id: string | null }>(
        sql`select billing_school_for_payment(${provider}, ${event.providerRef}) as school_id`,
      );
      return result.rows[0]?.school_id ?? null;
    });
    if (!schoolId) throw unknownPayment();
    seen.schoolId = schoolId;
    await this.tenant.runInTenant({ schoolId, userId: null }, () => this.apply(provider, event));
    return { received: true };
  }

  private async apply(provider: string, event: PaymentWebhookEvent): Promise<void> {
    const byRef = and(eq(payments.provider, provider), eq(payments.providerRef, event.providerRef));
    const [found] = await this.tenant.tx
      .select({ studentId: payments.studentId })
      .from(payments)
      .where(byRef);
    if (!found) throw unknownPayment();
    await this.ledger.lockStudent(found.studentId);
    const [payment] = await this.tenant.tx.select().from(payments).where(byRef).for('update');
    if (!payment) throw unknownPayment();
    const next = webhookTransition(payment.status, event.type);
    if (!next) return;
    if (event.amountMinor !== payment.amountMinor || event.currency !== payment.currency) {
      throw new ConflictError('amount_mismatch', t('errors.amount_mismatch'));
    }
    if (!payment.priceItemId) throw new Error(`Payment ${payment.id} has no price item`);
    const item = await this.purchases.priceItem(payment.priceItemId);
    if (!item) throw new Error(`Price item ${payment.priceItemId} is missing`);
    if (next === 'failed') {
      const version = await this.settle(payment, 'failed', null);
      await this.publisher.append([
        newEvent(PaymentFailed, {
          aggregateType: PAYMENT_AGGREGATE,
          aggregateId: payment.id,
          aggregateVersion: version,
          payload: {
            paymentId: payment.id,
            studentId: payment.studentId,
            payerUserId: payment.payerUserId,
            method: payment.method,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            priceItemId: item.id,
          },
        }),
      ]);
      return;
    }
    const invoice = await this.invoices.issueInvoice({
      studentId: payment.studentId,
      payerUserId: payment.payerUserId,
      priceItemId: item.id,
      description: item.name,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      taxRateBp: item.taxRateBp,
    });
    const version = await this.settle(payment, 'succeeded', invoice.id);
    await this.purchases.deliver({
      studentId: payment.studentId,
      paymentId: payment.id,
      priceItem: item,
    });
    await this.publisher.append([
      newEvent(PaymentSucceeded, {
        aggregateType: PAYMENT_AGGREGATE,
        aggregateId: payment.id,
        aggregateVersion: version,
        payload: { ...purchasePayload(payment, item, payment.method), invoiceId: invoice.id },
      }),
    ]);
  }

  private async settle(
    payment: PaymentRow,
    status: 'succeeded' | 'failed',
    invoiceId: string | null,
  ): Promise<number> {
    const version = payment.version + 1;
    await this.tenant.tx
      .update(payments)
      .set({ status, invoiceId, version })
      .where(eq(payments.id, payment.id));
    return version;
  }
}
