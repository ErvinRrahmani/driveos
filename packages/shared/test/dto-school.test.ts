import { describe, expect, it } from 'vitest';
import {
  connectPaymentAccountRequestSchema,
  createBranchRequestSchema,
  createVehicleRequestSchema,
  listVehiclesQuerySchema,
  moderateReviewRequestSchema,
  pageQuerySchema,
  submitReviewRequestSchema,
  updatePublicProfileRequestSchema,
  replaceOpeningHoursRequestSchema,
  updateSchoolRequestSchema,
  updateSchoolSettingsRequestSchema,
  updateVehicleRequestSchema,
} from '../src/index.js';

const id = '0192f000-0004-7000-8000-000000000001';
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('page query', () => {
  it('defaults the limit to 50 and bounds it to 1..200', () => {
    expect(pageQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(pageQuerySchema.parse({ cursor: 'abc', limit: '200' })).toEqual({
      cursor: 'abc',
      limit: 200,
    });
    expect(ok(pageQuerySchema, { limit: '0' })).toBe(false);
    expect(ok(pageQuerySchema, { limit: '201' })).toBe(false);
  });
});

describe('PATCH /v1/school', () => {
  it('needs at least one field and never takes currency, country or school id', () => {
    expect(ok(updateSchoolRequestSchema, { name: 'Fahrschule Spree' })).toBe(true);
    expect(ok(updateSchoolRequestSchema, {})).toBe(false);
    expect(ok(updateSchoolRequestSchema, { currency: 'USD' })).toBe(false);
    expect(ok(updateSchoolRequestSchema, { countryCode: 'US' })).toBe(false);
    expect(ok(updateSchoolRequestSchema, { name: 'X', schoolId: id })).toBe(false);
  });
});

describe('PATCH /v1/school/settings', () => {
  it('validates ranges and wall-clock times', () => {
    expect(ok(updateSchoolSettingsRequestSchema, { cancellationWindowHours: 48 })).toBe(true);
    expect(ok(updateSchoolSettingsRequestSchema, { quietHoursStart: '22:00' })).toBe(true);
    expect(ok(updateSchoolSettingsRequestSchema, { quietHoursStart: '25:00' })).toBe(false);
    expect(ok(updateSchoolSettingsRequestSchema, { cancellationWindowHours: -1 })).toBe(false);
    expect(ok(updateSchoolSettingsRequestSchema, {})).toBe(false);
  });
});

describe('PUT /v1/school/opening-hours', () => {
  it('needs ISO weekdays 1..7 and opens before closes', () => {
    const row = { branchId: null, weekday: 1, opens: '08:00', closes: '20:00' };
    expect(ok(replaceOpeningHoursRequestSchema, { items: [row] })).toBe(true);
    expect(ok(replaceOpeningHoursRequestSchema, { items: [] })).toBe(true);
    expect(ok(replaceOpeningHoursRequestSchema, { items: [{ ...row, weekday: 0 }] })).toBe(false);
    expect(ok(replaceOpeningHoursRequestSchema, { items: [{ ...row, weekday: 8 }] })).toBe(false);
    expect(
      ok(replaceOpeningHoursRequestSchema, {
        items: [{ ...row, opens: '20:00', closes: '08:00' }],
      }),
    ).toBe(false);
  });
});

describe('branches and vehicles', () => {
  it('bounds coordinates', () => {
    const branch = { name: 'Mitte', address: 'Unter den Linden 1', lat: 52.5, lng: 13.4 };
    expect(ok(createBranchRequestSchema, branch)).toBe(true);
    expect(ok(createBranchRequestSchema, { ...branch, lat: 91 })).toBe(false);
  });

  it('requires a known transmission and lets PATCH deactivate', () => {
    const vehicle = {
      branchId: id,
      plate: 'B-DS 103',
      makeModel: 'Volkswagen Polo',
      transmission: 'manual',
      licenceClass: 'B',
    };
    expect(createVehicleRequestSchema.parse(vehicle).active).toBe(true);
    expect(ok(createVehicleRequestSchema, { ...vehicle, transmission: 'cvt' })).toBe(false);
    expect(ok(updateVehicleRequestSchema, { active: false })).toBe(true);
    expect(ok(updateVehicleRequestSchema, {})).toBe(false);
  });

  it('filters the vehicle list by string booleans', () => {
    expect(listVehiclesQuerySchema.parse({ active: 'false' })).toEqual({
      active: 'false',
      limit: 50,
    });
    expect(ok(listVehiclesQuerySchema, { active: 'no' })).toBe(false);
  });
});

describe('POST /v1/school/payment-account', () => {
  it('takes a provider name', () => {
    expect(ok(connectPaymentAccountRequestSchema, { provider: 'fake' })).toBe(true);
    expect(ok(connectPaymentAccountRequestSchema, {})).toBe(false);
  });
});

describe('PUT /v1/school/public-profile', () => {
  it('needs at least one field and accepts nulls to clear optional ones', () => {
    expect(ok(updatePublicProfileRequestSchema, {})).toBe(false);
    expect(ok(updatePublicProfileRequestSchema, { headline: null, phone: null })).toBe(true);
    expect(ok(updatePublicProfileRequestSchema, { slug: 'abc', extra: 1 })).toBe(false);
  });

  it('takes E.164 phone numbers and https links only', () => {
    expect(ok(updatePublicProfileRequestSchema, { whatsappNumber: '+355691234567' })).toBe(true);
    expect(ok(updatePublicProfileRequestSchema, { whatsappNumber: '0691234567' })).toBe(false);
    expect(ok(updatePublicProfileRequestSchema, { phone: '+0123456789' })).toBe(false);
    expect(ok(updatePublicProfileRequestSchema, { facebookUrl: 'https://fb.com/x' })).toBe(true);
    expect(ok(updatePublicProfileRequestSchema, { facebookUrl: 'http://fb.com/x' })).toBe(false);
    expect(ok(updatePublicProfileRequestSchema, { headline: 'x'.repeat(121) })).toBe(false);
  });
});

describe('reviews', () => {
  it('takes a 1–5 rating and optional text of at most 600 characters', () => {
    expect(submitReviewRequestSchema.parse({ rating: 5, text: '  Great  ' })).toEqual({
      rating: 5,
      text: 'Great',
    });
    expect(ok(submitReviewRequestSchema, { rating: 0 })).toBe(false);
    expect(ok(submitReviewRequestSchema, { rating: 4.5 })).toBe(false);
    expect(ok(submitReviewRequestSchema, { rating: 5, text: 'x'.repeat(601) })).toBe(false);
  });

  it('moderates to approved or hidden only', () => {
    expect(ok(moderateReviewRequestSchema, { status: 'approved' })).toBe(true);
    expect(ok(moderateReviewRequestSchema, { status: 'hidden' })).toBe(true);
    expect(ok(moderateReviewRequestSchema, { status: 'pending' })).toBe(false);
  });
});
