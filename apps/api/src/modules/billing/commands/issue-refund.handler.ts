import { type IssueRefundResponse, RefundIssued } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
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
import { newId } from '../../../kernel/db/columns.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { keepsBalanceAllowed } from '../domain/ledger-rules.js';
import { isRefundable, paymentStatusAfterRefund, refundFits } from '../domain/payment-rules.js';
import { InvoiceIssuer } from '../infra/invoice-issuer.js';
import { LEDGER_WRITER, type LedgerWriter } from '../infra/ledger-writer.js';
import { PAYMENT_AGGREGATE, REFUND_AGGREGATE, type PaymentRow } from '../infra/payment-events.js';
import { payments, refunds } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { IssueRefundCommand } from './issue-refund.command.js';
import { StatusCodes } from 'http-status-codes';

interface ProviderOutcome {
  providerRef: string | null;
  status: 'pending' | 'succeeded' | 'failed';
}

@CommandHandler(IssueRefundCommand)
export class IssueRefundHandler implements ICommandHandler<
  IssueRefundCommand,
  IssueRefundResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly publisher: EventPublisher,
    private readonly school: SchoolFacts,
    private readonly invoices: InvoiceIssuer,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async execute({ actor, body }: IssueRefundCommand): Promise<IssueRefundResponse> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Refunds need a school scope');
    if (!actor.membershipId)
      throw new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'));
    const [found] = await this.tenant.tx
      .select({ studentId: payments.studentId })
      .from(payments)
      .where(eq(payments.id, body.paymentId));
    if (!found) throw notFound();
    await this.ledger.lockStudent(found.studentId);
    const [payment] = await this.tenant.tx
      .select()
      .from(payments)
      .where(eq(payments.id, body.paymentId))
      .for('update');
    if (!payment) throw notFound();
    if (!isRefundable(payment.status) || !payment.invoiceId) {
      throw new ConflictError('payment_not_refundable', t('errors.payment_not_refundable'));
    }
    if (body.currency !== payment.currency) {
      throw new ConflictError('amount_mismatch', t('errors.amount_mismatch'));
    }
    const refundedMinor = await this.refundedSoFar(payment.id);
    if (
      !refundFits({
        paymentMinor: payment.amountMinor,
        refundedMinor,
        amountMinor: body.amountMinor,
      })
    ) {
      throw new ConflictError('refund_exceeds_payment', t('errors.refund_exceeds_payment'));
    }
    if (body.minutesRemoved > 0) {
      const balance = await this.ledger.balance(payment.studentId);
      const allowNegative = await this.school.allowsNegativeBalance();
      if (!keepsBalanceAllowed({ balance, delta: -body.minutesRemoved, allowNegative })) {
        throw new ConflictError('insufficient_balance', t('errors.insufficient_balance'));
      }
    }
    const refundId = newId();
    const outcome = await this.refundWithProvider(payment, refundId, body.amountMinor);
    if (outcome.status === 'failed') {
      throw new ConflictError('refund_failed', t('errors.refund_failed'));
    }
    const creditNote = await this.invoices.issueCreditNote({
      invoiceId: payment.invoiceId,
      refundId,
      amountMinor: body.amountMinor,
      status: outcome.status === 'succeeded' ? 'paid' : 'issued',
    });
    const [refund] = await this.tenant.tx
      .insert(refunds)
      .values({
        id: refundId,
        schoolId,
        paymentId: payment.id,
        amountMinor: body.amountMinor,
        currency: body.currency,
        minutesRemoved: body.minutesRemoved,
        reason: body.reason,
        providerRef: outcome.providerRef,
        creditNoteId: creditNote.id,
        status: outcome.status,
      })
      .returning();
    if (!refund) throw new Error('Refund insert returned no row');
    if (body.minutesRemoved > 0) {
      await this.ledger.refund({
        studentId: payment.studentId,
        minutes: body.minutesRemoved,
        refundId,
        paymentId: payment.id,
        createdByMembershipId: actor.membershipId,
      });
    }
    await this.tenant.tx
      .update(payments)
      .set({
        status: paymentStatusAfterRefund(payment.amountMinor, refundedMinor + body.amountMinor),
        version: payment.version + 1,
      })
      .where(eq(payments.id, payment.id));
    await this.publisher.append([
      newEvent(RefundIssued, {
        aggregateType: REFUND_AGGREGATE,
        aggregateId: refundId,
        aggregateVersion: refund.version,
        payload: {
          refundId,
          paymentId: payment.id,
          studentId: payment.studentId,
          amountMinor: body.amountMinor,
          currency: body.currency,
          minutesRemoved: body.minutesRemoved,
          creditNoteId: creditNote.id,
          method: payment.method,
        },
      }),
    ]);
    await this.audit.record({
      action: 'refund.issue',
      targetType: PAYMENT_AGGREGATE,
      targetId: payment.id,
      reason: body.reason,
    });
    return {
      id: refundId,
      version: refund.version,
      status: refund.status,
      creditNoteId: creditNote.id,
    };
  }

  private async refundedSoFar(paymentId: string): Promise<number> {
    const [row] = await this.tenant.tx
      .select({ total: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, paymentId), ne(refunds.status, 'failed')));
    return Number(row?.total ?? 0);
  }

  private async refundWithProvider(
    payment: PaymentRow,
    refundId: string,
    amountMinor: number,
  ): Promise<ProviderOutcome> {
    if (payment.method !== 'in_app') return { providerRef: null, status: 'succeeded' };
    const account = await this.school.paymentAccount();
    if (!payment.providerRef || payment.provider !== this.provider.name || !account) {
      throw new ConflictError('payment_account_missing', t('errors.payment_account_missing'));
    }
    return this.provider.refund({
      accountRef: account.accountRef,
      providerRef: payment.providerRef,
      amountMinor,
      currency: payment.currency,
      refundId,
    });
  }
}
