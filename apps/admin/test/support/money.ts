import type { Invoice, LedgerEntry } from '@driveos/shared';
import { STUDENTS } from './students';

export const MONEY = {
  invoice: '0192f000-010b-7000-8000-000000000001',
  creditNote: '0192f000-010b-7000-8000-000000000002',
  payment: '0192f000-010a-7000-8000-000000000001',
  packagePriceItem: '0192f000-000c-7000-8000-000000000002',
  singlePriceItem: '0192f000-000c-7000-8000-000000000001',
  instructorChat: '0192f000-011a-7000-8000-000000000001',
  schoolChat: '0192f000-011a-7000-8000-000000000002',
  message: '0192f000-011b-7000-8000-000000000001',
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const purchase: LedgerEntry = {
  id: '0192f000-010d-7000-8000-000000000001',
  entryType: 'purchase',
  minutes: 600,
  balanceAfter: 600,
  lessonId: null,
  paymentId: MONEY.payment,
  refundId: null,
  priceItemId: MONEY.packagePriceItem,
  note: null,
  createdByMembershipId: null,
  createdAt: '2026-10-01T10:00:00.000Z',
};

export const stellaLedger = { items: [purchase], nextCursor: null };

export { STUDENTS };

export const packageInvoice: Invoice = {
  id: MONEY.invoice,
  kind: 'invoice',
  creditNoteForId: null,
  studentId: STUDENTS.stella,
  buyerName: 'Stella Student',
  series: '2026',
  number: 42,
  formattedNumber: '2026-000042',
  status: 'paid',
  issuedAt: '2026-10-01T10:00:00.000Z',
  subtotalMinor: 50420,
  taxMinor: 9580,
  totalMinor: 60000,
  currency: 'EUR',
  paymentId: MONEY.payment,
  refundedMinor: 6000,
  lines: [
    {
      id: '0192f000-0121-7000-8000-000000000001',
      priceItemId: MONEY.packagePriceItem,
      description: '10-lesson package',
      quantity: 1,
      unitMinor: 60000,
      taxRateBp: 1900,
      taxMinor: 9580,
      totalMinor: 60000,
      currency: 'EUR',
    },
  ],
};

export function invoiceList(...patches: Partial<Invoice>[]) {
  return { items: patches.map((patch) => ({ ...packageInvoice, ...patch })), nextCursor: null };
}
