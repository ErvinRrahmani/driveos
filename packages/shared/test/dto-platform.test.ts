import { describe, expect, it } from 'vitest';
import {
  createPlanRequestSchema,
  createSchoolRequestSchema,
  createSchoolResponseSchema,
  importQuestionPackRequestSchema,
  listAuditLogQuerySchema,
  markStatementPaidRequestSchema,
  startSupportSessionRequestSchema,
  updatePlanRequestSchema,
} from '../src/index.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';

const id = '0192f000-0001-7000-8000-000000000001';
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('POST /v1/platform/statements/{id}/mark-paid', () => {
  const paidAt = '2026-10-05T09:00:00.000Z';

  it('requires a reference for bank transfers only', () => {
    expect(ok(markStatementPaidRequestSchema, { method: 'bank_transfer', paidAt })).toBe(false);
    expect(
      ok(markStatementPaidRequestSchema, { method: 'bank_transfer', paidAt, reference: 'TX-1' }),
    ).toBe(true);
    expect(ok(markStatementPaidRequestSchema, { method: 'cash', paidAt })).toBe(true);
  });

  it('rejects card or other methods', () => {
    expect(ok(markStatementPaidRequestSchema, { method: 'card', paidAt, reference: 'x' })).toBe(
      false,
    );
  });
});

describe('POST /v1/platform/schools', () => {
  it('needs an owner contact and a valid currency', () => {
    const body = DTO_SAMPLES.platform.createSchoolRequest;
    expect(ok(createSchoolRequestSchema, body)).toBe(true);
    expect(ok(createSchoolRequestSchema, { ...body, currency: 'eur' })).toBe(false);
    expect(ok(createSchoolRequestSchema, { ...body, owner: { fullName: 'Nobody' } })).toBe(false);
  });

  it('starts the school active unless onboarding is asked for', () => {
    const { status: _status, ...body } = DTO_SAMPLES.platform.createSchoolRequest;
    expect(createSchoolRequestSchema.parse(body).status).toBe('active');
    expect(createSchoolRequestSchema.parse({ ...body, status: 'onboarding' }).status).toBe(
      'onboarding',
    );
    expect(ok(createSchoolRequestSchema, { ...body, status: 'suspended' })).toBe(false);
  });

  it('answers with the school, the owner invitation and, outside production, its token', () => {
    const answer = { id, version: 1, schoolId: id, invitationId: id };
    expect(ok(createSchoolResponseSchema, answer)).toBe(true);
    expect(ok(createSchoolResponseSchema, { ...answer, acceptToken: 'tok' })).toBe(true);
    expect(ok(createSchoolResponseSchema, { ...answer, invitationId: undefined })).toBe(false);
  });
});

describe('plans', () => {
  it('keeps amounts as non-negative integers with a currency', () => {
    const plan = DTO_SAMPLES.platform.createPlanRequest;
    expect(ok(createPlanRequestSchema, { ...plan, baseAmountMinor: 19.9 })).toBe(false);
    expect(ok(createPlanRequestSchema, { ...plan, studentFeeMinor: -1 })).toBe(false);
    const { currency: _currency, ...withoutCurrency } = plan;
    expect(ok(createPlanRequestSchema, withoutCurrency)).toBe(false);
    expect(ok(updatePlanRequestSchema, {})).toBe(false);
    expect(ok(updatePlanRequestSchema, { active: false })).toBe(true);
  });
});

describe('POST /v1/platform/question-packs/import', () => {
  it('accepts the dev pack format with either rule set', () => {
    const pack = DTO_SAMPLES.platform.importQuestionPackRequest;
    expect(ok(importQuestionPackRequestSchema, pack)).toBe(true);
    expect(
      ok(importQuestionPackRequestSchema, {
        ...pack,
        exam: { rules: 'error_points', questions: 30, timeLimitMinutes: 45, maxErrorPoints: 10 },
      }),
    ).toBe(true);
    expect(
      ok(importQuestionPackRequestSchema, {
        ...pack,
        exam: { rules: 'fraction', questions: 30, timeLimitMinutes: 45, passMark: 1.5 },
      }),
    ).toBe(false);
  });
});

describe('POST /v1/platform/support-sessions', () => {
  it('needs a reason and caps the duration at 60 minutes', () => {
    expect(startSupportSessionRequestSchema.parse({ schoolId: id, reason: 'Ticket 42' })).toEqual({
      schoolId: id,
      reason: 'Ticket 42',
      durationMinutes: 60,
    });
    expect(ok(startSupportSessionRequestSchema, { schoolId: id, reason: '' })).toBe(false);
    expect(
      ok(startSupportSessionRequestSchema, { schoolId: id, reason: 'x', durationMinutes: 61 }),
    ).toBe(false);
  });
});

describe('GET /v1/audit-log', () => {
  it('pages and filters by time and session', () => {
    expect(
      listAuditLogQuerySchema.parse({ supportSessionId: id, from: '2026-10-01T00:00:00Z' }),
    ).toEqual({ supportSessionId: id, from: '2026-10-01T00:00:00Z', limit: 50 });
  });
});
