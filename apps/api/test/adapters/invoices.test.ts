import { describe, expect, it } from 'vitest';
import {
  GenericEuInvoicePolicy,
  taxFromGross,
} from '../../src/adapters/invoices/generic-eu-invoice-policy.js';
import type { InvoiceDocument } from '../../src/adapters/invoices/invoice-policy.js';

const policy = new GenericEuInvoicePolicy();

const translate = (key: string, params: Record<string, unknown> = {}) =>
  `${key}${Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''}`;

describe('taxFromGross (tax included in the gross amount)', () => {
  it('takes 19% out of 100.00 gross as 15.97', () => {
    expect(taxFromGross(10_000, 1900)).toBe(1597);
  });

  it('rounds half away from zero and mirrors negative amounts', () => {
    expect(taxFromGross(107, 700)).toBe(7);
    expect(taxFromGross(-10_000, 1900)).toBe(-1597);
    expect(taxFromGross(0, 1900)).toBe(0);
    expect(taxFromGross(5000, 0)).toBe(0);
  });

  it('stays exact for large amounts', () => {
    expect(taxFromGross(999_999_999, 2500)).toBe(200_000_000);
  });
});

describe('GenericEuInvoicePolicy', () => {
  it('uses one series per calendar year in the school time zone', () => {
    const newYearUtc = new Date('2026-12-31T23:30:00Z');
    expect(policy.series(newYearUtc, { timeZone: 'Europe/Berlin' })).toBe('2027');
    expect(policy.series(newYearUtc, { timeZone: 'Europe/Lisbon' })).toBe('2026');
  });

  it('formats numbers as YYYY-000001', () => {
    expect(policy.formatNumber('2026', 1)).toBe('2026-000001');
    expect(policy.formatNumber('2026', 1_234_567)).toBe('2026-1234567');
  });

  it('computes tax lines and totals from gross amounts', () => {
    const totals = policy.computeLines([
      {
        description: '10-lesson package',
        priceItemId: null,
        quantity: 1,
        unitMinor: 10_000,
        taxRateBp: 1900,
      },
      { description: 'Fee', priceItemId: null, quantity: 2, unitMinor: 500, taxRateBp: 0 },
    ]);
    expect(totals.lines).toEqual([
      expect.objectContaining({ unitMinor: 10_000, taxMinor: 1597, totalMinor: 10_000 }),
      expect.objectContaining({ quantity: 2, unitMinor: 500, taxMinor: 0, totalMinor: 1000 }),
    ]);
    expect(totals).toMatchObject({ subtotalMinor: 9403, taxMinor: 1597, totalMinor: 11_000 });
  });

  it('computes negative credit-note lines', () => {
    const totals = policy.computeLines([
      {
        description: 'Refund',
        priceItemId: null,
        quantity: 1,
        unitMinor: -10_000,
        taxRateBp: 1900,
      },
    ]);
    expect(totals).toMatchObject({ subtotalMinor: -8403, taxMinor: -1597, totalMinor: -10_000 });
  });

  it('names the missing seller and buyer fields', () => {
    expect(
      policy.missingSellerFields({
        name: 'Spree',
        legalName: '',
        taxId: null,
        address: 'Street 1',
        countryCode: 'DE',
      }),
    ).toEqual(['legalName']);
    expect(
      policy.missingBuyerFields({ name: ' ', email: null, phone: null, address: null }),
    ).toEqual(['name']);
  });

  it('renders a PDF with the number, parties and translated labels', () => {
    const document: InvoiceDocument = {
      kind: 'invoice',
      formattedNumber: '2026-000007',
      creditNoteForNumber: null,
      issuedAt: new Date('2026-10-08T10:00:00Z'),
      timeZone: 'Europe/Berlin',
      seller: {
        name: 'Fahrschule Spree',
        legalName: 'Fahrschule Spree GmbH',
        taxId: 'DE123456789',
        address: 'Spreeweg 1, Berlin',
        countryCode: 'DE',
      },
      buyer: { name: 'Stella Student', email: null, phone: null, address: null },
      lines: policy.computeLines([
        {
          description: '10-lesson package',
          priceItemId: null,
          quantity: 1,
          unitMinor: 60_000,
          taxRateBp: 1900,
        },
      ]).lines,
      subtotalMinor: 50_420,
      taxMinor: 9580,
      totalMinor: 60_000,
      currency: 'EUR',
    };
    const pdf = Buffer.from(policy.renderPdf(document, translate)).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('2026-000007');
    expect(pdf).toContain('Fahrschule Spree GmbH');
    expect(pdf).toContain('Stella Student');
    expect(pdf).toContain('invoices.pdf.title_invoice');
    expect(pdf).toContain('600.00 EUR');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
