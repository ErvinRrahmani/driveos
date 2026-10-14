import { describe, expect, it } from 'vitest';
import {
  adjustLedgerRequestSchema,
  checkoutRequestSchema,
  createPriceItemRequestSchema,
  fakePaymentWebhookEventSchema,
  issueRefundRequestSchema,
  listInvoicesQuerySchema,
  recordCashPaymentRequestSchema,
  updatePriceItemRequestSchema,
} from '../src/index.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;
const samples = DTO_SAMPLES.billing;

describe('price items', () => {
  it('keeps money as integer minor units with a currency', () => {
    const body = samples.createPriceItemRequest;
    expect(ok(createPriceItemRequestSchema, body)).toBe(true);
    expect(ok(createPriceItemRequestSchema, { ...body, amountMinor: 65.5 })).toBe(false);
    expect(ok(createPriceItemRequestSchema, { ...body, amountMinor: -1 })).toBe(false);
    const { currency: _currency, ...withoutCurrency } = body;
    expect(ok(createPriceItemRequestSchema, withoutCurrency)).toBe(false);
  });

  it('requires credit minutes for lessons and packages', () => {
    const body = samples.createPriceItemRequest;
    expect(
      ok(createPriceItemRequestSchema, { ...body, kind: 'package', creditMinutes: null }),
    ).toBe(false);
    expect(
      ok(createPriceItemRequestSchema, {
        ...body,
        kind: 'upsell',
        creditMinutes: null,
        entitlementKind: 'premium_theory',
      }),
    ).toBe(true);
  });

  it('cannot change kind or currency on update and needs a field', () => {
    expect(ok(updatePriceItemRequestSchema, {})).toBe(false);
    expect(ok(updatePriceItemRequestSchema, { currency: 'USD' })).toBe(false);
    expect(ok(updatePriceItemRequestSchema, { kind: 'fee' })).toBe(false);
    expect(ok(updatePriceItemRequestSchema, { amountMinor: 7000 })).toBe(true);
  });
});

describe('money write bodies', () => {
  it('never takes a school id', () => {
    expect(
      ok(checkoutRequestSchema, {
        ...samples.checkoutRequest,
        schoolId: samples.checkoutRequest.priceItemId,
      }),
    ).toBe(false);
    expect(
      ok(recordCashPaymentRequestSchema, {
        ...samples.recordCashPaymentRequest,
        schoolId: samples.checkoutRequest.priceItemId,
      }),
    ).toBe(false);
  });

  it('records cash or bank transfer only, with a positive amount', () => {
    const body = samples.recordCashPaymentRequest;
    expect(ok(recordCashPaymentRequestSchema, { ...body, method: 'in_app' })).toBe(false);
    expect(ok(recordCashPaymentRequestSchema, { ...body, amountMinor: 0 })).toBe(false);
    expect(ok(recordCashPaymentRequestSchema, { ...body, method: 'bank_transfer' })).toBe(true);
  });

  it('refunds a positive amount and a non-negative number of minutes with a reason', () => {
    const body = samples.issueRefundRequest;
    expect(ok(issueRefundRequestSchema, { ...body, minutesRemoved: 0 })).toBe(true);
    expect(ok(issueRefundRequestSchema, { ...body, amountMinor: 0 })).toBe(false);
    expect(ok(issueRefundRequestSchema, { ...body, amountMinor: -100 })).toBe(false);
    expect(ok(issueRefundRequestSchema, { ...body, minutesRemoved: -60 })).toBe(false);
    expect(ok(issueRefundRequestSchema, { ...body, reason: ' ' })).toBe(false);
  });

  it('adjusts by a non-zero number of minutes with a note and a reason', () => {
    const body = samples.adjustLedgerRequest;
    expect(ok(adjustLedgerRequestSchema, { ...body, minutes: 0 })).toBe(false);
    expect(ok(adjustLedgerRequestSchema, { ...body, minutes: -45 })).toBe(true);
    const { reason: _reason, ...withoutReason } = body;
    expect(ok(adjustLedgerRequestSchema, withoutReason)).toBe(false);
  });
});

describe('invoices and webhooks', () => {
  it('filters invoices by student, kind and a valid range', () => {
    expect(ok(listInvoicesQuerySchema, { kind: 'credit_note' })).toBe(true);
    expect(
      ok(listInvoicesQuerySchema, {
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('parses the fake provider event shape', () => {
    const event = samples.fakePaymentWebhookEvent;
    expect(ok(fakePaymentWebhookEventSchema, { ...event, type: 'payment.refunded' })).toBe(false);
    expect(ok(fakePaymentWebhookEventSchema, { ...event, type: 'payment.failed' })).toBe(true);
  });
});
