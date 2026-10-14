import { describe, expect, it } from 'vitest';
import {
  isRefundable,
  paymentStatusAfterRefund,
  refundFits,
  webhookTransition,
} from '../../../src/modules/billing/domain/payment-rules.js';

describe('webhookTransition', () => {
  it('settles a pending payment as succeeded or failed', () => {
    expect(webhookTransition('pending', 'payment.succeeded')).toBe('succeeded');
    expect(webhookTransition('pending', 'payment.failed')).toBe('failed');
  });

  it('ignores webhooks for payments that are already settled', () => {
    for (const status of ['succeeded', 'failed', 'refunded', 'partially_refunded'] as const) {
      expect(webhookTransition(status, 'payment.succeeded')).toBeNull();
      expect(webhookTransition(status, 'payment.failed')).toBeNull();
    }
  });
});

describe('refunds', () => {
  it('refunds only succeeded or partially refunded payments', () => {
    expect(isRefundable('succeeded')).toBe(true);
    expect(isRefundable('partially_refunded')).toBe(true);
    expect(isRefundable('pending')).toBe(false);
    expect(isRefundable('failed')).toBe(false);
    expect(isRefundable('refunded')).toBe(false);
  });

  it('caps the refund at the payment amount minus earlier refunds', () => {
    expect(refundFits({ paymentMinor: 10_000, refundedMinor: 0, amountMinor: 10_000 })).toBe(true);
    expect(refundFits({ paymentMinor: 10_000, refundedMinor: 4000, amountMinor: 6000 })).toBe(true);
    expect(refundFits({ paymentMinor: 10_000, refundedMinor: 4000, amountMinor: 6001 })).toBe(
      false,
    );
    expect(refundFits({ paymentMinor: 10_000, refundedMinor: 0, amountMinor: 0 })).toBe(false);
  });

  it('marks the payment refunded once the full amount is refunded', () => {
    expect(paymentStatusAfterRefund(10_000, 4000)).toBe('partially_refunded');
    expect(paymentStatusAfterRefund(10_000, 10_000)).toBe('refunded');
  });
});
