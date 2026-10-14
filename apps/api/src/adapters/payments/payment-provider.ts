import type { FakePaymentWebhookEvent, PaymentAccountStatus } from '@driveos/shared';

export interface ConnectAccountInput {
  schoolId: string;
  returnUrl: string | null;
}

export interface ConnectedAccount {
  accountRef: string;
  status: PaymentAccountStatus;
  onboardingUrl: string | null;
}

export interface CheckoutInput {
  accountRef: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
  description: string;
}

export interface CheckoutSession {
  providerRef: string;
  checkoutUrl: string;
}

export interface RefundInput {
  accountRef: string;
  providerRef: string;
  amountMinor: number;
  currency: string;
  refundId: string;
}

export interface ProviderRefund {
  providerRef: string;
  status: 'pending' | 'succeeded' | 'failed';
}

export type PaymentWebhookEvent = FakePaymentWebhookEvent;

export type WebhookHeaders = Record<string, string | string[] | undefined>;

export interface PaymentProvider {
  readonly name: string;
  connectAccount(input: ConnectAccountInput): Promise<ConnectedAccount>;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  refund(input: RefundInput): Promise<ProviderRefund>;
  verifyWebhook(rawBody: Uint8Array, headers: WebhookHeaders): PaymentWebhookEvent | null;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
