import type {
  InvoiceBuyer,
  InvoiceDocument,
  InvoiceItem,
  InvoicePolicy,
  InvoiceSeller,
  InvoiceTotals,
  Translate,
} from './invoice-policy.js';
import { renderTextPdf } from '../pdf/text-pdf.js';
import { formatMinorAmount } from '../money.js';

const BP_SCALE = 10_000;
const NUMBER_DIGITS = 6;

export function taxFromGross(grossMinor: number, taxRateBp: number): number {
  if (grossMinor < 0) return -taxFromGross(-grossMinor, taxRateBp);
  const gross = BigInt(grossMinor);
  const rate = BigInt(taxRateBp);
  const divisor = BigInt(BP_SCALE + taxRateBp);
  return Number((2n * gross * rate + divisor) / (2n * divisor));
}

function formatRate(taxRateBp: number): string {
  return `${(taxRateBp / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const isBlank = (value: string | null) => value === null || value.trim() === '';

export class GenericEuInvoicePolicy implements InvoicePolicy {
  readonly name = 'generic_eu';

  series(issuedAt: Date, school: { timeZone: string }): string {
    return new Intl.DateTimeFormat('en', { timeZone: school.timeZone, year: 'numeric' }).format(
      issuedAt,
    );
  }

  formatNumber(series: string, number: number): string {
    return `${series}-${String(number).padStart(NUMBER_DIGITS, '0')}`;
  }

  computeLines(items: readonly InvoiceItem[]): InvoiceTotals {
    const lines = items.map((item) => {
      const totalMinor = item.unitMinor * item.quantity;
      return { ...item, totalMinor, taxMinor: taxFromGross(totalMinor, item.taxRateBp) };
    });
    const totalMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0);
    const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
    return { lines, subtotalMinor: totalMinor - taxMinor, taxMinor, totalMinor };
  }

  missingSellerFields(seller: InvoiceSeller): (keyof InvoiceSeller)[] {
    return (['name', 'legalName', 'address', 'countryCode'] as const).filter((field) =>
      isBlank(seller[field]),
    );
  }

  missingBuyerFields(buyer: InvoiceBuyer): (keyof InvoiceBuyer)[] {
    return isBlank(buyer.name) ? ['name'] : [];
  }

  renderPdf(document: InvoiceDocument, translate: Translate): Uint8Array {
    const money = (minor: number) => formatMinorAmount(minor, document.currency);
    const { seller, buyer } = document;
    const title =
      document.kind === 'credit_note'
        ? translate('invoices.pdf.title_credit_note', { number: document.formattedNumber })
        : translate('invoices.pdf.title_invoice', { number: document.formattedNumber });
    return renderTextPdf([
      title,
      translate('invoices.pdf.issued_on', {
        date: formatDate(document.issuedAt, document.timeZone),
      }),
      ...(document.creditNoteForNumber
        ? [translate('invoices.pdf.credit_note_for', { number: document.creditNoteForNumber })]
        : []),
      '',
      translate('invoices.pdf.seller'),
      seller.legalName,
      seller.name,
      seller.address,
      seller.countryCode,
      ...(seller.taxId ? [translate('invoices.pdf.tax_id', { taxId: seller.taxId })] : []),
      '',
      translate('invoices.pdf.buyer'),
      buyer.name,
      ...[buyer.address, buyer.email, buyer.phone].filter((v): v is string => !isBlank(v)),
      '',
      ...document.lines.map((line) =>
        translate('invoices.pdf.line', {
          description: line.description,
          quantity: line.quantity,
          unit: money(line.unitMinor),
          rate: formatRate(line.taxRateBp),
          tax: money(line.taxMinor),
          total: money(line.totalMinor),
        }),
      ),
      '',
      translate('invoices.pdf.subtotal', { amount: money(document.subtotalMinor) }),
      translate('invoices.pdf.tax', { amount: money(document.taxMinor) }),
      translate('invoices.pdf.total', { amount: money(document.totalMinor) }),
      '',
      translate('invoices.pdf.tax_included'),
    ]);
  }
}
