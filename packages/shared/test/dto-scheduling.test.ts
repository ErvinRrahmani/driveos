import { describe, expect, it } from 'vitest';
import {
  acceptSlotOfferRequestSchema,
  bookLessonRequestSchema,
  calendarQuerySchema,
  calendarResponseSchema,
  cancelLessonRequestSchema,
  completeLessonRequestSchema,
  createLessonTypeRequestSchema,
  createSlotOfferRequestSchema,
  freeSlotsQuerySchema,
  joinWaitingListRequestSchema,
  moveLessonRequestSchema,
  replaceAvailabilityRequestSchema,
  syncPullQuerySchema,
  syncPushRequestSchema,
  addTimeOffRequestSchema,
  SYNC_OP_TYPES,
  AvailabilityChanged,
} from '../src/index.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';

const id = '0192f000-0007-7000-8000-000000000001';
const other = '0192f000-0006-7000-8000-000000000001';
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('lesson types', () => {
  it('only knows the exam_car entitlement', () => {
    const body = DTO_SAMPLES.scheduling.createLessonTypeRequest;
    expect(ok(createLessonTypeRequestSchema, body)).toBe(true);
    expect(
      ok(createLessonTypeRequestSchema, { ...body, requiresEntitlement: 'premium_theory' }),
    ).toBe(false);
    expect(ok(createLessonTypeRequestSchema, { ...body, minutes: 0 })).toBe(false);
    expect(ok(createLessonTypeRequestSchema, { ...body, creditMinutes: -10 })).toBe(false);
  });
});

describe('GET /v1/calendar and free slots', () => {
  it('needs to after from', () => {
    const from = '2026-10-12T00:00:00.000Z';
    const to = '2026-10-19T00:00:00.000Z';
    expect(calendarQuerySchema.parse({ from, to, instructorId: id })).toEqual({
      from,
      to,
      instructorId: id,
      limit: 50,
    });
    expect(ok(calendarQuerySchema, { from: to, to: from })).toBe(false);
    expect(ok(freeSlotsQuerySchema, { lessonTypeId: other, from, to })).toBe(true);
    expect(ok(freeSlotsQuerySchema, { from, to })).toBe(false);
  });
});

describe('calendar response', () => {
  it('carries the availability windows and time off of the range for shading', () => {
    const sample = DTO_SAMPLES.scheduling.calendarResponse;
    expect(sample.availability?.length).toBeGreaterThan(0);
    expect(sample.timeOff?.length).toBeGreaterThan(0);
    expect(calendarResponseSchema.parse(sample)).toEqual(sample);
    expect(ok(calendarResponseSchema, { items: [], nextCursor: null })).toBe(true);
    expect(
      ok(calendarResponseSchema, {
        ...sample,
        timeOff: [{ ...sample.timeOff?.[0], reason: 'private' }],
      }),
    ).toBe(true);
    expect(
      calendarResponseSchema.parse({
        ...sample,
        timeOff: [{ ...sample.timeOff?.[0], reason: 'private' }],
      }).timeOff?.[0],
    ).not.toHaveProperty('reason');
  });
});

describe('PUT availability and time off', () => {
  it('takes an optional effectiveTo on or after effectiveFrom', () => {
    const body = { effectiveFrom: '2026-10-12', windows: [] };
    expect(replaceAvailabilityRequestSchema.parse({ ...body, effectiveTo: '2026-10-12' })).toEqual({
      ...body,
      effectiveTo: '2026-10-12',
    });
    expect(ok(replaceAvailabilityRequestSchema, { ...body, effectiveTo: '2026-10-11' })).toBe(
      false,
    );
    expect(
      AvailabilityChanged.schema.parse({
        instructorMembershipId: id,
        effectiveFrom: '2026-10-12',
        effectiveTo: '2026-10-18',
        windows: [],
      }),
    ).toMatchObject({ effectiveTo: '2026-10-18' });
  });

  it('needs windows that start before they end', () => {
    const body = { effectiveFrom: '2026-10-12', windows: [] };
    expect(ok(replaceAvailabilityRequestSchema, body)).toBe(true);
    expect(
      ok(replaceAvailabilityRequestSchema, {
        ...body,
        windows: [{ weekday: 1, startTime: '17:00', endTime: '09:00' }],
      }),
    ).toBe(false);
    expect(
      ok(addTimeOffRequestSchema, {
        start: '2026-10-20T08:00:00.000Z',
        end: '2026-10-19T08:00:00.000Z',
        reason: 'Holiday',
      }),
    ).toBe(false);
  });
});

describe('booking and lesson changes', () => {
  it('never takes the school, the end or the status from the client', () => {
    const body = DTO_SAMPLES.scheduling.bookLessonRequest;
    expect(ok(bookLessonRequestSchema, body)).toBe(true);
    expect(ok(bookLessonRequestSchema, { ...body, schoolId: id })).toBe(false);
    expect(ok(bookLessonRequestSchema, { ...body, end: body.start })).toBe(false);
    expect(ok(bookLessonRequestSchema, { ...body, status: 'completed' })).toBe(false);
  });

  it('moves with at least one change', () => {
    expect(ok(moveLessonRequestSchema, { start: '2026-10-14T08:00:00.000Z' })).toBe(true);
    expect(ok(moveLessonRequestSchema, { version: 2 })).toBe(false);
    expect(ok(moveLessonRequestSchema, {})).toBe(false);
  });

  it('cancels with an optional reason and completes with bounded progress levels', () => {
    expect(cancelLessonRequestSchema.parse({})).toEqual({});
    expect(cancelLessonRequestSchema.parse({ restoreCredit: false })).toEqual({
      restoreCredit: false,
    });
    expect(ok(cancelLessonRequestSchema, { restoreCredit: 'no' })).toBe(false);
    expect(
      ok(completeLessonRequestSchema, {
        progress: [{ syllabusItemId: id, level: 6, note: '' }],
      }),
    ).toBe(false);
    expect(
      ok(completeLessonRequestSchema, {
        progress: [{ syllabusItemId: id, level: 3, note: 'Good' }],
        privateNote: 'Nervous at roundabouts',
      }),
    ).toBe(true);
  });
});

describe('sync', () => {
  const op = {
    opId: '0192f000-00ff-7000-8000-000000000001',
    clientAt: '2026-10-12T08:00:00.000Z',
  };

  it('knows exactly the SPEC op types', () => {
    expect([...SYNC_OP_TYPES].sort()).toEqual(
      [
        'lesson.create',
        'lesson.move',
        'lesson.cancel',
        'lesson.complete',
        'lesson.no_show',
        'progress.upsert',
        'private_note.upsert',
        'payment.cash',
      ].sort(),
    );
  });

  it('requires a base version on lesson changes but not on creates or notes', () => {
    const move = {
      ...op,
      type: 'lesson.move',
      payload: { lessonId: id, start: '2026-10-14T08:00:00.000Z' },
    };
    expect(ok(syncPushRequestSchema, { ops: [{ ...move, baseVersion: 3 }] })).toBe(true);
    expect(ok(syncPushRequestSchema, { ops: [{ ...move, baseVersion: null }] })).toBe(false);
    const note = {
      ...op,
      type: 'private_note.upsert',
      baseVersion: null,
      payload: { privateNoteId: other, lessonId: id, body: 'Check mirrors' },
    };
    expect(ok(syncPushRequestSchema, { ops: [note] })).toBe(true);
  });

  it('rejects unknown op types, empty batches and mismatched payloads', () => {
    expect(ok(syncPushRequestSchema, { ops: [] })).toBe(false);
    expect(
      ok(syncPushRequestSchema, {
        ops: [{ ...op, type: 'lesson.delete', baseVersion: 1, payload: { lessonId: id } }],
      }),
    ).toBe(false);
    expect(
      ok(syncPushRequestSchema, {
        ops: [{ ...op, type: 'lesson.cancel', baseVersion: 1, payload: { start: 'x' } }],
      }),
    ).toBe(false);
  });

  it('validates cash payments recorded offline', () => {
    const cash = {
      ...op,
      type: 'payment.cash',
      baseVersion: null,
      payload: {
        paymentId: other,
        studentId: id,
        priceItemId: other,
        amountMinor: 6500,
        currency: 'EUR',
      },
    };
    expect(ok(syncPushRequestSchema, { ops: [cash] })).toBe(true);
    expect(
      ok(syncPushRequestSchema, {
        ops: [{ ...cash, payload: { ...cash.payload, currency: 'eur' } }],
      }),
    ).toBe(false);
  });

  it('pulls from a numeric cursor', () => {
    expect(syncPullQuerySchema.parse({ cursor: '120' })).toEqual({ cursor: '120', limit: 200 });
    expect(ok(syncPullQuerySchema, { cursor: 'abc' })).toBe(false);
  });
});

describe('offers', () => {
  it('needs at least one preferred window', () => {
    const body = DTO_SAMPLES.scheduling.joinWaitingListRequest;
    expect(ok(joinWaitingListRequestSchema, body)).toBe(true);
    expect(ok(joinWaitingListRequestSchema, { ...body, preferredWindows: [] })).toBe(false);
  });

  it('creates manual offers and accepts for an optional student', () => {
    expect(ok(createSlotOfferRequestSchema, DTO_SAMPLES.scheduling.createSlotOfferRequest)).toBe(
      true,
    );
    expect(acceptSlotOfferRequestSchema.parse({})).toEqual({});
    expect(ok(acceptSlotOfferRequestSchema, { studentId: id })).toBe(true);
  });
});
