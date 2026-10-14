import { Inject } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import {
  INVOICE_POLICY,
  type InvoiceBuyer,
  type InvoicePolicy,
  type InvoiceSeller,
  type Translate,
} from '../../../adapters/invoices/invoice-policy.js';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { i18n } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { invoiceLines, invoices } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { StudentAccess } from '../infra/student-access.js';
import { GetInvoicePdfQuery, type InvoicePdf } from './get-invoice-pdf.query.js';

const translate: Translate = (key, params) => String(i18n.t(key as never, params as never));

@QueryHandler(GetInvoicePdfQuery)
export class GetInvoicePdfHandler implements IQueryHandler<GetInvoicePdfQuery, InvoicePdf> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
    private readonly school: SchoolFacts,
    @Inject(INVOICE_POLICY) private readonly policy: InvoicePolicy,
  ) {}

  async execute({ actor, invoiceId }: GetInvoicePdfQuery): Promise<InvoicePdf> {
    const [invoice] = await this.tenant.tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    if (!invoice || !invoice.issuedAt) throw notFound();
    if (!(await this.access.readsAnyStudent(actor, 'invoices.read'))) {
      await this.access.ownStudent(actor, invoice.studentId);
    }
    const lines = await this.tenant.tx
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoice.id))
      .orderBy(asc(invoiceLines.id));
    const [original] = invoice.creditNoteForId
      ? await this.tenant.tx
          .select({ series: invoices.series, number: invoices.number })
          .from(invoices)
          .where(eq(invoices.id, invoice.creditNoteForId))
      : [];
    const { timeZone } = await this.school.profile();
    const formattedNumber = this.policy.formatNumber(invoice.series, invoice.number);
    const body = this.policy.renderPdf(
      {
        kind: invoice.kind,
        formattedNumber,
        creditNoteForNumber: original
          ? this.policy.formatNumber(original.series, original.number)
          : null,
        issuedAt: invoice.issuedAt,
        timeZone,
        seller: invoice.sellerSnapshot as InvoiceSeller,
        buyer: invoice.buyerSnapshot as InvoiceBuyer,
        lines,
        subtotalMinor: invoice.subtotalMinor,
        taxMinor: invoice.taxMinor,
        totalMinor: invoice.totalMinor,
        currency: invoice.currency,
      },
      translate,
    );
    return { fileName: `${formattedNumber}.pdf`, contentType: 'application/pdf', body };
  }
}
