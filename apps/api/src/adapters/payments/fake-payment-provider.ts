import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { FAKE_PAYMENT_SIGNATURE_HEADER, fakePaymentWebhookEventSchema } from '@driveos/shared';
import type {
  CheckoutInput,
  CheckoutSession,
  ConnectAccountInput,
  ConnectedAccount,
  PaymentProvider,
  PaymentWebhookEvent,
  ProviderRefund,
  RefundInput,
  WebhookHeaders,
} from './payment-provider.js';

export interface FakeCheckoutSession {
  providerRef: string;
  amountMinor: number;
  currency: string;
  description: string;
}

export interface SignedWebhook {
  body: Uint8Array;
  headers: Record<string, string>;
}

export interface FakePaymentProviderOptions {
  baseUrl: string;
  secret: string;
}

export function signFakePaymentWebhook(secret: string, rawBody: Uint8Array): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function parseJson(rawBody: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return undefined;
  }
}

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  private readonly sessions = new Map<string, FakeCheckoutSession>();

  constructor(private readonly options: FakePaymentProviderOptions) {}

  connectAccount(input: ConnectAccountInput): Promise<ConnectedAccount> {
    return Promise.resolve({
      accountRef: `fake_acct_${input.schoolId.replaceAll('-', '')}`,
      status: 'active',
      onboardingUrl: null,
    });
  }

  createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const providerRef = `fake_pay_${randomUUID()}`;
    this.sessions.set(providerRef, {
      providerRef,
      amountMinor: input.amountMinor,
      currency: input.currency,
      description: input.description,
    });
    return Promise.resolve({
      providerRef,
      checkoutUrl: `${this.options.baseUrl}/fake-pay/${providerRef}`,
    });
  }

  checkoutSession(providerRef: string): FakeCheckoutSession | null {
    return this.sessions.get(providerRef) ?? null;
  }

  signedWebhook(event: PaymentWebhookEvent): SignedWebhook {
    const body = new TextEncoder().encode(JSON.stringify(event));
    return {
      body,
      headers: {
        'content-type': 'application/json',
        [FAKE_PAYMENT_SIGNATURE_HEADER]: signFakePaymentWebhook(this.options.secret, body),
      },
    };
  }

  refund(_input: RefundInput): Promise<ProviderRefund> {
    return Promise.resolve({ providerRef: `fake_refund_${randomUUID()}`, status: 'succeeded' });
  }

  verifyWebhook(rawBody: Uint8Array, headers: WebhookHeaders): PaymentWebhookEvent | null {
    const signature = headers[FAKE_PAYMENT_SIGNATURE_HEADER];
    if (typeof signature !== 'string') return null;
    const expected = Buffer.from(signFakePaymentWebhook(this.options.secret, rawBody));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const parsed = fakePaymentWebhookEventSchema.safeParse(parseJson(rawBody));
    return parsed.success ? parsed.data : null;
  }
}
