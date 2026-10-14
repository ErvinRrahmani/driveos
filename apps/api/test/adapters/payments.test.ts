import { FAKE_PAYMENT_SIGNATURE_HEADER } from '@driveos/shared';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { FakePayController } from '../../src/adapters/payments/fake-pay.controller.js';
import {
  FakePaymentProvider,
  signFakePaymentWebhook,
} from '../../src/adapters/payments/fake-payment-provider.js';
import type { Env } from '../../src/kernel/config/env.js';
import { NotFoundError } from '../../src/kernel/http/errors.js';

const SECRET = 'test-fake-payment-secret-0000000000000000';
const schoolId = '0192f000-0001-7000-8000-000000000001';
const provider = new FakePaymentProvider({ baseUrl: 'http://localhost:13000', secret: SECRET });

const event = {
  type: 'payment.succeeded' as const,
  providerRef: 'fake_pay_1',
  amountMinor: 5500,
  currency: 'EUR',
  occurredAt: '2026-10-08T10:00:00.000Z',
};

describe('FakePaymentProvider', () => {
  it('connects a school to an active account with a stable reference', async () => {
    const first = await provider.connectAccount({ schoolId, returnUrl: null });
    const again = await provider.connectAccount({ schoolId, returnUrl: null });
    expect(first).toEqual({ accountRef: again.accountRef, status: 'active', onboardingUrl: null });
    expect(first.accountRef).toMatch(/^fake_acct_[0-9a-f]{32}$/);
    expect(provider.name).toBe('fake');
  });

  it('creates a checkout on the local fake pay page', async () => {
    const checkout = await provider.createCheckout({
      accountRef: 'fake_acct_1',
      paymentId: '0192f000-0099-7000-8000-000000000001',
      amountMinor: 5500,
      currency: 'EUR',
      description: 'Single lesson',
    });
    expect(checkout.providerRef).toMatch(/^fake_pay_/);
    expect(checkout.checkoutUrl).toBe(`http://localhost:13000/fake-pay/${checkout.providerRef}`);
  });

  it('refunds immediately', async () => {
    const refund = await provider.refund({
      accountRef: 'fake_acct_1',
      providerRef: 'fake_pay_1',
      amountMinor: 100,
      currency: 'EUR',
      refundId: '0192f000-0099-7000-8000-000000000002',
    });
    expect(refund).toEqual({
      providerRef: expect.stringMatching(/^fake_refund_/),
      status: 'succeeded',
    });
  });

  it('accepts a webhook signed with its secret and rejects anything else', () => {
    const raw = new TextEncoder().encode(JSON.stringify(event));
    const signature = signFakePaymentWebhook(SECRET, raw);
    expect(provider.verifyWebhook(raw, { [FAKE_PAYMENT_SIGNATURE_HEADER]: signature })).toEqual(
      event,
    );
    expect(provider.verifyWebhook(raw, { [FAKE_PAYMENT_SIGNATURE_HEADER]: 'bad' })).toBeNull();
    expect(provider.verifyWebhook(raw, {})).toBeNull();
    const forged = new TextEncoder().encode(JSON.stringify({ ...event, amountMinor: 1 }));
    expect(
      provider.verifyWebhook(forged, { [FAKE_PAYMENT_SIGNATURE_HEADER]: signature }),
    ).toBeNull();
    const junk = new TextEncoder().encode('not json');
    const junkSig = signFakePaymentWebhook(SECRET, junk);
    expect(provider.verifyWebhook(junk, { [FAKE_PAYMENT_SIGNATURE_HEADER]: junkSig })).toBeNull();
  });
  it('remembers its checkouts for the local pay page and builds signed webhooks', async () => {
    const checkout = await provider.createCheckout({
      accountRef: 'fake_acct_1',
      paymentId: '0192f000-0099-7000-8000-000000000002',
      amountMinor: 6500,
      currency: 'EUR',
      description: 'Single lesson',
    });
    expect(provider.checkoutSession(checkout.providerRef)).toEqual({
      providerRef: checkout.providerRef,
      amountMinor: 6500,
      currency: 'EUR',
      description: 'Single lesson',
    });
    expect(provider.checkoutSession('fake_pay_unknown')).toBeNull();
    const signed = provider.signedWebhook({ ...event, providerRef: checkout.providerRef });
    expect(provider.verifyWebhook(signed.body, signed.headers)).toEqual({
      ...event,
      providerRef: checkout.providerRef,
    });
  });
});

describe('FakePayController', () => {
  const configFor = (nodeEnv: string) =>
    ({ get: () => nodeEnv }) as unknown as ConfigService<Env, true>;

  it('serves the pay page outside production and 404s in production', async () => {
    const fake = new FakePaymentProvider({ baseUrl: 'http://localhost:13000', secret: SECRET });
    const { providerRef } = await fake.createCheckout({
      accountRef: 'fake_acct_1',
      paymentId: '0192f000-0099-7000-8000-000000000003',
      amountMinor: 6500,
      currency: 'EUR',
      description: 'Single lesson',
    });
    expect(new FakePayController(fake, configFor('development')).show(providerRef)).toContain(
      '65.00 EUR',
    );
    expect(() => new FakePayController(fake, configFor('production')).show(providerRef)).toThrow(
      NotFoundError,
    );
  });
});
