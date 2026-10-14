export interface InvoiceSeller {
  name: string;
  legalName: string;
  taxId: string | null;
  address: string;
  countryCode: string;
}

export interface InvoiceBuyer {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface InvoiceItem {
  description: string;
  priceItemId: string | null;
  quantity: number;
  unitMinor: number;
  taxRateBp: number;
}

export interface InvoiceLineAmounts extends InvoiceItem {
  taxMinor: number;
  totalMinor: number;
}

export interface InvoiceTotals {
  lines: InvoiceLineAmounts[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface InvoiceDocument {
  kind: 'invoice' | 'credit_note';
  formattedNumber: string;
  creditNoteForNumber: string | null;
  issuedAt: Date;
  timeZone: string;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  lines: readonly InvoiceLineAmounts[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}

export type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface InvoicePolicy {
  readonly name: string;
  series(issuedAt: Date, school: { timeZone: string }): string;
  formatNumber(series: string, number: number): string;
  computeLines(items: readonly InvoiceItem[]): InvoiceTotals;
  missingSellerFields(seller: InvoiceSeller): (keyof InvoiceSeller)[];
  missingBuyerFields(buyer: InvoiceBuyer): (keyof InvoiceBuyer)[];
  renderPdf(document: InvoiceDocument, translate: Translate): Uint8Array;
}

export const INVOICE_POLICY = Symbol('INVOICE_POLICY');
