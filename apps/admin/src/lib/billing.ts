import type { Invoice, LedgerEntry } from '@driveos/shared';

export function remainingRefundableMinor(invoice: Invoice): number {
  if (invoice.kind !== 'invoice') return 0;
  return Math.max(0, invoice.totalMinor - invoice.refundedMinor);
}

export function maxMinutesRemoved(balanceMinutes: number, allowNegative: boolean): number | null {
  return allowNegative ? null : Math.max(0, balanceMinutes);
}

export type RefundablePayment = LedgerEntry & { paymentId: string };

export function refundablePayments(entries: readonly LedgerEntry[]): RefundablePayment[] {
  const byPayment = new Map<string, RefundablePayment>();
  for (const entry of entries) {
    if (entry.entryType !== 'purchase' || entry.paymentId === null) continue;
    if (!byPayment.has(entry.paymentId))
      byPayment.set(entry.paymentId, { ...entry, paymentId: entry.paymentId });
  }
  return [...byPayment.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function suggestedPaymentId(
  invoice: Invoice,
  payments: readonly RefundablePayment[],
): string | undefined {
  if (invoice.paymentId !== null) return invoice.paymentId;
  const items = new Set(invoice.lines.map((line) => line.priceItemId).filter(Boolean));
  const issued = invoice.issuedAt ? Date.parse(invoice.issuedAt) : Date.now();
  const distance = (payment: RefundablePayment) => Math.abs(Date.parse(payment.createdAt) - issued);
  return payments
    .filter((payment) => payment.priceItemId !== null && items.has(payment.priceItemId))
    .sort((a, b) => distance(a) - distance(b))[0]?.paymentId;
}

export type RefundPaymentChoice = { paymentId: string; purchase: RefundablePayment | null };

export function refundPaymentChoices(
  invoice: Invoice,
  payments: readonly RefundablePayment[],
): RefundPaymentChoice[] {
  const choices = payments.map((purchase) => ({ paymentId: purchase.paymentId, purchase }));
  const own = invoice.paymentId;
  if (own === null || payments.some((payment) => payment.paymentId === own)) return choices;
  return [{ paymentId: own, purchase: null }, ...choices];
}
