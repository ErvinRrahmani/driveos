import { CreditNoteIssued, InvoiceIssued } from '@driveos/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import {
  INVOICE_POLICY,
  type InvoiceBuyer,
  type InvoicePolicy,
  type InvoiceSeller,
  type InvoiceTotals,
} from '../../../adapters/invoices/invoice-policy.js';
import { EventPublisher, newEvent } from '../../../kernel/cqrs/index.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { invoiceCounters, invoiceLines, invoices } from './schema.js';
import { SchoolFacts } from './school-facts.js';
import { StudentLookup } from './student-lookup.js';

export const INVOICE_AGGREGATE = 'invoice';

export interface IssuedInvoice {
  id: string;
  series: string;
  number: number;
  totalMinor: number;
  currency: string;
  issuedAt: Date;
}

export interface InvoicedPurchase {
  studentId: string;
  payerUserId: string | null;
  priceItemId: string;
  description: string;
  amountMinor: number;
  currency: string;
  taxRateBp: number;
}

export interface CreditNoteRequest {
  invoiceId: string;
  refundId: string;
  amountMinor: number;
  status: 'issued' | 'paid';
}

interface Draft {
  kind: 'invoice' | 'credit_note';
  studentId: string;
  creditNoteForId: string | null;
  buyer: InvoiceBuyer;
  totals: InvoiceTotals;
  currency: string;
  status: 'issued' | 'paid';
}

const distinct = (ids: readonly (string | null)[]) => [
  ...new Set(ids.filter((id): id is string => id !== null)),
];

@Injectable()
export class InvoiceIssuer {
  constructor(
    private readonly tenant: TenantContext,
    private readonly publisher: EventPublisher,
    private readonly school: SchoolFacts,
    private readonly students: StudentLookup,
    @Inject(INVOICE_POLICY) private readonly policy: InvoicePolicy,
  ) {}

  async issueInvoice(purchase: InvoicedPurchase): Promise<IssuedInvoice> {
    const contact = await this.students.contactOf(purchase.studentId);
    if (!contact) throw notFound();
    const totals = this.policy.computeLines([
      {
        description: purchase.description,
        priceItemId: purchase.priceItemId,
        quantity: 1,
        unitMinor: purchase.amountMinor,
        taxRateBp: purchase.taxRateBp,
      },
    ]);
    const invoice = await this.issue({
      kind: 'invoice',
      studentId: purchase.studentId,
      creditNoteForId: null,
      buyer: {
        name: contact.name ?? t('invoices.unnamed_buyer'),
        email: contact.email,
        phone: contact.phone,
        address: null,
      },
      totals,
      currency: purchase.currency,
      status: 'paid',
    });
    await this.publisher.append([
      newEvent(InvoiceIssued, {
        aggregateType: INVOICE_AGGREGATE,
        aggregateId: invoice.id,
        aggregateVersion: 1,
        payload: {
          invoiceId: invoice.id,
          studentId: purchase.studentId,
          kind: 'invoice',
          series: invoice.series,
          number: invoice.number,
          totalMinor: invoice.totalMinor,
          currency: invoice.currency,
          issuedAt: invoice.issuedAt.toISOString(),
          payerUserIds: distinct([contact.userId, purchase.payerUserId]),
        },
      }),
    ]);
    return invoice;
  }

  async issueCreditNote(request: CreditNoteRequest): Promise<IssuedInvoice> {
    const [original] = await this.tenant.tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, request.invoiceId), eq(invoices.kind, 'invoice')));
    if (!original) throw notFound();
    const [line] = await this.tenant.tx
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, original.id))
      .orderBy(asc(invoiceLines.id))
      .limit(1);
    if (!line) throw new Error(`Invoice ${original.id} has no lines`);
    const totals = this.policy.computeLines([
      {
        description: t('invoices.credit_note_line', { description: line.description }),
        priceItemId: line.priceItemId,
        quantity: 1,
        unitMinor: -request.amountMinor,
        taxRateBp: line.taxRateBp,
      },
    ]);
    const note = await this.issue({
      kind: 'credit_note',
      studentId: original.studentId,
      creditNoteForId: original.id,
      buyer: original.buyerSnapshot as InvoiceBuyer,
      totals,
      currency: original.currency,
      status: request.status,
    });
    const contact = await this.students.contactOf(original.studentId);
    await this.publisher.append([
      newEvent(CreditNoteIssued, {
        aggregateType: INVOICE_AGGREGATE,
        aggregateId: note.id,
        aggregateVersion: 1,
        payload: {
          creditNoteId: note.id,
          creditNoteForId: original.id,
          refundId: request.refundId,
          studentId: original.studentId,
          series: note.series,
          number: note.number,
          totalMinor: note.totalMinor,
          currency: note.currency,
          issuedAt: note.issuedAt.toISOString(),
          payerUserIds: distinct([contact?.userId ?? null]),
        },
      }),
    ]);
    return note;
  }

  private async issue(draft: Draft): Promise<IssuedInvoice> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Issuing an invoice needs a school scope');
    const profile = await this.school.profile();
    const seller: InvoiceSeller = {
      name: profile.name,
      legalName: profile.legalName,
      taxId: profile.taxId,
      address: profile.address,
      countryCode: profile.countryCode,
    };
    const missing = {
      seller: this.policy.missingSellerFields(seller),
      buyer: this.policy.missingBuyerFields(draft.buyer),
    };
    if (missing.seller.length > 0 || missing.buyer.length > 0) {
      throw new ConflictError(
        'invoice_details_missing',
        t('errors.invoice_details_missing'),
        missing,
      );
    }
    const issuedAt = new Date();
    const series = this.policy.series(issuedAt, profile);
    const number = await this.nextNumber(schoolId, series);
    const [row] = await this.tenant.tx
      .insert(invoices)
      .values({
        schoolId,
        studentId: draft.studentId,
        kind: draft.kind,
        creditNoteForId: draft.creditNoteForId,
        series,
        number,
        issuedAt,
        sellerSnapshot: seller,
        buyerSnapshot: draft.buyer,
        subtotalMinor: draft.totals.subtotalMinor,
        taxMinor: draft.totals.taxMinor,
        totalMinor: draft.totals.totalMinor,
        currency: draft.currency,
        status: draft.status,
      })
      .returning({ id: invoices.id });
    if (!row) throw new Error('Invoice insert returned no row');
    await this.tenant.tx.insert(invoiceLines).values(
      draft.totals.lines.map((line) => ({
        schoolId,
        invoiceId: row.id,
        priceItemId: line.priceItemId,
        description: line.description,
        quantity: line.quantity,
        unitMinor: line.unitMinor,
        taxRateBp: line.taxRateBp,
        taxMinor: line.taxMinor,
        totalMinor: line.totalMinor,
        currency: draft.currency,
      })),
    );
    return {
      id: row.id,
      series,
      number,
      totalMinor: draft.totals.totalMinor,
      currency: draft.currency,
      issuedAt,
    };
  }

  private async nextNumber(schoolId: string, series: string): Promise<number> {
    const tx = this.tenant.tx;
    await tx
      .insert(invoiceCounters)
      .values({ schoolId, series, nextNumber: 1 })
      .onConflictDoNothing();
    const [counter] = await tx
      .select({ nextNumber: invoiceCounters.nextNumber })
      .from(invoiceCounters)
      .where(eq(invoiceCounters.series, series))
      .for('update');
    if (!counter) throw new Error(`Invoice counter ${series} is missing`);
    await tx
      .update(invoiceCounters)
      .set({ nextNumber: counter.nextNumber + 1 })
      .where(eq(invoiceCounters.series, series));
    return counter.nextNumber;
  }
}
