import { describe, expect, it } from 'vitest';
import {
  type PriceItemShape,
  priceItemIssues,
} from '../../../src/modules/billing/domain/price-item.js';
import { PRICE_LISTS } from '../../../scripts/db/seed-data.js';

const lesson: PriceItemShape = {
  kind: 'lesson',
  creditMinutes: 60,
  entitlementKind: null,
  currency: 'EUR',
  taxRateBp: 1900,
};

const paths = (item: PriceItemShape, currency = 'EUR') =>
  priceItemIssues(item, currency).map((issue) => issue.path.join('.'));

describe('priceItemIssues', () => {
  it('accepts a lesson with credit minutes in the school currency', () => {
    expect(priceItemIssues(lesson, 'EUR')).toEqual([]);
  });

  it('refuses a currency other than the school currency', () => {
    expect(paths({ ...lesson, currency: 'USD' })).toEqual(['currency']);
  });

  it('keeps the tax rate between 0 and 10000 basis points', () => {
    expect(paths({ ...lesson, taxRateBp: 0 })).toEqual([]);
    expect(paths({ ...lesson, taxRateBp: 10_000 })).toEqual([]);
    expect(paths({ ...lesson, taxRateBp: -1 })).toEqual(['taxRateBp']);
    expect(paths({ ...lesson, taxRateBp: 10_001 })).toEqual(['taxRateBp']);
    expect(paths({ ...lesson, taxRateBp: 19.5 })).toEqual(['taxRateBp']);
  });

  it('needs credit minutes for lessons and packages and no entitlement', () => {
    expect(paths({ ...lesson, creditMinutes: null })).toEqual(['creditMinutes']);
    expect(paths({ ...lesson, kind: 'package', creditMinutes: null })).toEqual(['creditMinutes']);
    expect(paths({ ...lesson, kind: 'package', creditMinutes: 0 })).toEqual(['creditMinutes']);
    expect(paths({ ...lesson, entitlementKind: 'exam_car' })).toEqual(['entitlementKind']);
  });

  it('needs an entitlement kind for upsells, which may also carry minutes', () => {
    const upsell: PriceItemShape = { ...lesson, kind: 'upsell', creditMinutes: null };
    expect(paths(upsell)).toEqual(['entitlementKind']);
    expect(paths({ ...upsell, entitlementKind: 'premium_theory' })).toEqual([]);
    expect(paths({ ...upsell, entitlementKind: 'exam_car', creditMinutes: 120 })).toEqual([]);
  });

  it('allows neither minutes nor an entitlement on a fee', () => {
    const fee: PriceItemShape = { ...lesson, kind: 'fee', creditMinutes: null };
    expect(paths(fee)).toEqual([]);
    expect(paths({ ...fee, creditMinutes: 60 })).toEqual(['creditMinutes']);
    expect(paths({ ...fee, entitlementKind: 'exam_car' })).toEqual(['entitlementKind']);
  });

  it('accepts every seeded price item', () => {
    for (const items of Object.values(PRICE_LISTS)) {
      for (const item of items) {
        expect(
          priceItemIssues(
            {
              kind: item.kind,
              creditMinutes: item.creditMinutes ?? null,
              entitlementKind: item.entitlementKind ?? null,
              currency: item.currency,
              taxRateBp: item.taxRateBp,
            },
            item.currency,
          ),
        ).toEqual([]);
      }
    }
  });
});
