import type { Invoice, LedgerEntry } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import {
  maxMinutesRemoved,
  refundablePayments,
  refundPaymentChoices,
  remainingRefundableMinor,
  suggestedPaymentId,
} from '../../src/lib/billing';

const invoice = (patch: Partial<Invoice>): Invoice => ({
  id: 'inv-1',
  kind: 'invoice',
  creditNoteForId: null,
  studentId: 'stu-1',
  buyerName: 'Stella Student',
  series: '2026',
  number: 1,
  formattedNumber: '2026-000001',
  status: 'paid',
  issuedAt: '2026-10-01T10:00:00.000Z',
  subtotalMinor: 50420,
  taxMinor: 9580,
  totalMinor: 60000,
  currency: 'EUR',
  paymentId: null,
  refundedMinor: 0,
  lines: [
    {
      id: 'line-1',
      priceItemId: 'package',
      description: '10-lesson package',
      quantity: 1,
      unitMinor: 60000,
      taxRateBp: 1900,
      taxMinor: 9580,
      totalMinor: 60000,
      currency: 'EUR',
    },
  ],
  ...patch,
});

const entry = (patch: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'entry',
  entryType: 'purchase',
  minutes: 600,
  balanceAfter: 600,
  lessonId: null,
  paymentId: 'pay-1',
  refundId: null,
  priceItemId: 'package',
  note: null,
  createdByMembershipId: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...patch,
});

describe('remainingRefundableMinor', () => {
  it('subtracts what was already refunded on the invoice payment', () => {
    expect(remainingRefundableMinor(invoice({ refundedMinor: 10000 }))).toBe(50000);
  });

  it('never goes below zero', () => {
    expect(remainingRefundableMinor(invoice({ refundedMinor: 70000 }))).toBe(0);
  });

  it('leaves nothing to refund on a credit note', () => {
    const note = invoice({ kind: 'credit_note', totalMinor: -6000, refundedMinor: 6000 });
    expect(remainingRefundableMinor(note)).toBe(0);
  });
});

describe('maxMinutesRemoved', () => {
  it('caps at the current balance unless negative balances are allowed', () => {
    expect(maxMinutesRemoved(540, false)).toBe(540);
    expect(maxMinutesRemoved(-30, false)).toBe(0);
    expect(maxMinutesRemoved(540, true)).toBeNull();
  });
});

describe('refundablePayments', () => {
  it('keeps purchases with a payment, newest first, once per payment', () => {
    const entries = [
      entry({ id: 'a', paymentId: 'pay-1', createdAt: '2026-10-01T10:00:00.000Z' }),
      entry({ id: 'b', entryType: 'debit', paymentId: null }),
      entry({ id: 'c', paymentId: null }),
      entry({ id: 'd', paymentId: 'pay-2', createdAt: '2026-10-03T10:00:00.000Z' }),
      entry({ id: 'e', paymentId: 'pay-1', createdAt: '2026-10-01T10:00:00.000Z' }),
    ];
    expect(refundablePayments(entries).map((item) => item.paymentId)).toEqual(['pay-2', 'pay-1']);
  });
});

describe('suggestedPaymentId', () => {
  it('prefers a purchase of a line item closest to the issue time', () => {
    const payments = refundablePayments([
      entry({ paymentId: 'far', createdAt: '2026-09-01T10:00:00.000Z' }),
      entry({
        paymentId: 'other-item',
        priceItemId: 'single',
        createdAt: '2026-10-01T10:00:00.000Z',
      }),
      entry({ paymentId: 'near', createdAt: '2026-10-01T10:00:05.000Z' }),
    ]);
    expect(suggestedPaymentId(invoice({}), payments)).toBe('near');
  });

  it('returns undefined when nothing matches', () => {
    expect(suggestedPaymentId(invoice({}), [])).toBeUndefined();
  });

  it('uses the payment that produced the invoice when known', () => {
    const payments = refundablePayments([entry({ paymentId: 'near' })]);
    expect(suggestedPaymentId(invoice({ paymentId: 'own' }), payments)).toBe('own');
  });
});

describe('refundPaymentChoices', () => {
  it('lists the ledger purchases when they include the invoice payment', () => {
    const payments = refundablePayments([
      entry({ paymentId: 'pay-2', createdAt: '2026-10-03T10:00:00.000Z' }),
      entry({ paymentId: 'pay-1' }),
    ]);
    expect(refundPaymentChoices(invoice({ paymentId: 'pay-1' }), payments)).toEqual([
      { paymentId: 'pay-2', purchase: payments[0] },
      { paymentId: 'pay-1', purchase: payments[1] },
    ]);
  });

  it('puts the invoice payment first when the ledger has no purchase for it', () => {
    const payments = refundablePayments([entry({ paymentId: 'pay-1' })]);
    expect(refundPaymentChoices(invoice({ paymentId: 'entitlement' }), payments)).toEqual([
      { paymentId: 'entitlement', purchase: null },
      { paymentId: 'pay-1', purchase: payments[0] },
    ]);
  });

  it('lists only the ledger purchases when the invoice has no payment', () => {
    expect(refundPaymentChoices(invoice({}), [])).toEqual([]);
  });
});
