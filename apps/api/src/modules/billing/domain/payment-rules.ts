import type { PaymentStatus } from '@driveos/shared';

export type WebhookEventType = 'payment.succeeded' | 'payment.failed';

export function webhookTransition(
  status: PaymentStatus,
  event: WebhookEventType,
): 'succeeded' | 'failed' | null {
  if (status !== 'pending') return null;
  return event === 'payment.succeeded' ? 'succeeded' : 'failed';
}

export function isRefundable(status: PaymentStatus): boolean {
  return status === 'succeeded' || status === 'partially_refunded';
}

export interface RefundCap {
  paymentMinor: number;
  refundedMinor: number;
  amountMinor: number;
}

export function refundFits({ paymentMinor, refundedMinor, amountMinor }: RefundCap): boolean {
  return amountMinor > 0 && amountMinor <= paymentMinor - refundedMinor;
}

export function paymentStatusAfterRefund(
  paymentMinor: number,
  refundedTotalMinor: number,
): 'refunded' | 'partially_refunded' {
  return refundedTotalMinor >= paymentMinor ? 'refunded' : 'partially_refunded';
}
