import { CashPaymentRecorded, type RecordCashPaymentResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { InvoiceIssuer } from '../infra/invoice-issuer.js';
import { LEDGER_WRITER, type LedgerWriter } from '../infra/ledger-writer.js';
import { PAYMENT_AGGREGATE, purchasePayload } from '../infra/payment-events.js';
import { Purchases } from '../infra/purchases.js';
import { payments } from '../infra/schema.js';
import { StudentLookup } from '../infra/student-lookup.js';
import { RecordCashPaymentCommand } from './record-cash-payment.command.js';
import { StatusCodes } from 'http-status-codes';

const BANK_TRANSFER_ROLES: readonly string[] = ['owner', 'office'];

@CommandHandler(RecordCashPaymentCommand)
export class RecordCashPaymentHandler implements ICommandHandler<
  RecordCashPaymentCommand,
  RecordCashPaymentResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly publisher: EventPublisher,
    private readonly students: StudentLookup,
    private readonly invoices: InvoiceIssuer,
    private readonly purchases: Purchases,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
  ) {}

  async execute({
    actor,
    body,
    paymentId = newId(),
  }: RecordCashPaymentCommand): Promise<RecordCashPaymentResponse> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Recording a payment needs a school scope');
    const forbidden = () => new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'));
    if (!actor.membershipId) throw forbidden();
    if (body.method !== 'cash' && !actor.roles.some((role) => BANK_TRANSFER_ROLES.includes(role))) {
      throw forbidden();
    }
    if (!(await this.students.exists(body.studentId))) throw notFound();
    const item = await this.purchases.priceItem(body.priceItemId);
    if (!item) throw notFound();
    if (body.amountMinor !== item.amountMinor || body.currency !== item.currency) {
      throw new ConflictError('amount_mismatch', t('errors.amount_mismatch'));
    }
    await this.ledger.lockStudent(body.studentId);
    const invoice = await this.invoices.issueInvoice({
      studentId: body.studentId,
      payerUserId: null,
      priceItemId: item.id,
      description: item.name,
      amountMinor: body.amountMinor,
      currency: body.currency,
      taxRateBp: item.taxRateBp,
    });
    const [payment] = await this.tenant.tx
      .insert(payments)
      .values({
        id: paymentId,
        schoolId,
        studentId: body.studentId,
        invoiceId: invoice.id,
        method: body.method,
        amountMinor: body.amountMinor,
        currency: body.currency,
        status: 'succeeded',
        recordedByMembershipId: actor.membershipId,
        priceItemId: item.id,
        reference: body.reference ?? null,
      })
      .returning();
    if (!payment) throw new Error('Payment insert returned no row');
    await this.purchases.deliver({ studentId: body.studentId, paymentId, priceItem: item });
    await this.publisher.append([
      newEvent(CashPaymentRecorded, {
        aggregateType: PAYMENT_AGGREGATE,
        aggregateId: paymentId,
        aggregateVersion: payment.version,
        payload: {
          ...purchasePayload(payment, item, body.method),
          invoiceId: invoice.id,
          recordedByMembershipId: actor.membershipId,
        },
      }),
    ]);
    return { id: paymentId, version: payment.version, invoiceId: invoice.id };
  }
}
