import type { Invoice } from '@driveos/shared';
import type { InvoiceBuyer, InvoicePolicy } from '../../../adapters/invoices/invoice-policy.js';
import type { invoiceLines, invoices } from './schema.js';

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceLineRow = typeof invoiceLines.$inferSelect;

export interface InvoicePayment {
  paymentId: string | null;
  refundedMinor: number;
}

export function toInvoice(
  row: InvoiceRow,
  lines: readonly InvoiceLineRow[],
  policy: InvoicePolicy,
  payment: InvoicePayment,
): Invoice {
  return {
    id: row.id,
    kind: row.kind,
    creditNoteForId: row.creditNoteForId,
    studentId: row.studentId,
    buyerName: (row.buyerSnapshot as InvoiceBuyer).name,
    series: row.series,
    number: row.number,
    formattedNumber: policy.formatNumber(row.series, row.number),
    status: row.status,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    subtotalMinor: row.subtotalMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    currency: row.currency,
    paymentId: payment.paymentId,
    refundedMinor: payment.refundedMinor,
    lines: lines.map((line) => ({
      id: line.id,
      priceItemId: line.priceItemId,
      description: line.description,
      quantity: line.quantity,
      unitMinor: line.unitMinor,
      taxRateBp: line.taxRateBp,
      taxMinor: line.taxMinor,
      totalMinor: line.totalMinor,
      currency: line.currency,
    })),
  };
}
