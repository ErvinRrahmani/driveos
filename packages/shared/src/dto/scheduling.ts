import { z } from 'zod';
import {
  amountMinorSchema,
  booleanQuerySchema,
  currencySchema,
  dateSchema,
  dateTimeSchema,
  hasSomeField,
  latitudeSchema,
  licenceClassSchema,
  localTimeSchema,
  longitudeSchema,
  minutesSchema,
  NO_FIELDS_MESSAGE,
  pageQuerySchema,
  pageResponseSchema,
  weekdaySchema,
} from './common.js';
import {
  bookedViaSchema,
  changeFeedOpSchema,
  lessonEntitlementSchema,
  lessonStatusSchema,
  lessonTypeKindSchema,
  slotOfferSourceSchema,
  slotOfferStatusSchema,
  syncOperationStatusSchema,
} from './enums.js';
import { vehicleSchema } from './school.js';
import { progressLevelSchema } from './training.js';

const startBeforeEnd = (range: { start: string; end: string }) =>
  Date.parse(range.start) < Date.parse(range.end);
const START_BEFORE_END = { message: 'start must be before end', path: ['end'] };

const fromBeforeTo = (range: { from: string; to: string }) =>
  Date.parse(range.from) < Date.parse(range.to);
const FROM_BEFORE_TO = { message: 'from must be before to', path: ['to'] };

const versionSchema = z.number().int().positive();
const creditMinutesSchema = minutesSchema.nonnegative();

const lessonTypeFields = {
  name: z.string().trim().min(1).max(100),
  kind: lessonTypeKindSchema,
  licenceClass: licenceClassSchema,
  minutes: z.number().int().min(5).max(600),
  creditMinutes: creditMinutesSchema,
  requiresVehicle: z.boolean(),
  requiresEntitlement: lessonEntitlementSchema.nullable(),
};

export const lessonTypeSchema = z.object({
  id: z.uuid(),
  ...lessonTypeFields,
  active: z.boolean(),
});
export type LessonType = z.infer<typeof lessonTypeSchema>;

export const listLessonTypesQuerySchema = pageQuerySchema.extend({
  active: booleanQuerySchema.optional(),
});
export type ListLessonTypesQuery = z.infer<typeof listLessonTypesQuerySchema>;

export const lessonTypeListResponseSchema = pageResponseSchema(lessonTypeSchema);
export type LessonTypeListResponse = z.infer<typeof lessonTypeListResponseSchema>;

export const createLessonTypeRequestSchema = z.strictObject({
  ...lessonTypeFields,
  active: z.boolean().default(true),
});
export type CreateLessonTypeRequest = z.infer<typeof createLessonTypeRequestSchema>;

export const updateLessonTypeRequestSchema = z
  .strictObject({ ...lessonTypeFields, active: z.boolean() })
  .partial()
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdateLessonTypeRequest = z.infer<typeof updateLessonTypeRequestSchema>;

export const lessonResponseSchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  instructorMembershipId: z.uuid(),
  instructorName: z.string(),
  vehicleId: z.uuid().nullable(),
  vehiclePlate: z.string().nullable(),
  lessonTypeId: z.uuid(),
  lessonTypeName: z.string(),
  lessonTypeKind: lessonTypeKindSchema,
  creditMinutes: creditMinutesSchema,
  start: dateTimeSchema,
  end: dateTimeSchema,
  status: lessonStatusSchema,
  pickupAddress: z.string(),
  pickupLat: latitudeSchema,
  pickupLng: longitudeSchema,
  bookedVia: bookedViaSchema,
  bookedByMembershipId: z.uuid(),
  lateCancel: z.boolean(),
  cancelledAt: dateTimeSchema.nullable(),
  cancelReason: z.string().nullable(),
  version: versionSchema,
});
export type LessonResponse = z.infer<typeof lessonResponseSchema>;

export const calendarQuerySchema = pageQuerySchema
  .extend({
    from: dateTimeSchema,
    to: dateTimeSchema,
    instructorId: z.uuid().optional(),
    vehicleId: z.uuid().optional(),
    studentId: z.uuid().optional(),
  })
  .refine(fromBeforeTo, FROM_BEFORE_TO);
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const calendarAvailabilitySchema = z.object({
  instructorMembershipId: z.uuid(),
  start: dateTimeSchema,
  end: dateTimeSchema,
});
export type CalendarAvailability = z.infer<typeof calendarAvailabilitySchema>;

export const calendarTimeOffSchema = z.object({
  id: z.uuid(),
  instructorMembershipId: z.uuid(),
  start: dateTimeSchema,
  end: dateTimeSchema,
});
export type CalendarTimeOff = z.infer<typeof calendarTimeOffSchema>;

export const calendarResponseSchema = pageResponseSchema(lessonResponseSchema).extend({
  availability: z.array(calendarAvailabilitySchema).optional(),
  timeOff: z.array(calendarTimeOffSchema).optional(),
});
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;

export const freeSlotsQuerySchema = z
  .object({
    lessonTypeId: z.uuid(),
    from: dateTimeSchema,
    to: dateTimeSchema,
    instructorId: z.uuid().optional(),
  })
  .refine(fromBeforeTo, FROM_BEFORE_TO);
export type FreeSlotsQuery = z.infer<typeof freeSlotsQuerySchema>;

export const freeSlotSchema = z.object({
  start: dateTimeSchema,
  end: dateTimeSchema,
  instructorMembershipId: z.uuid(),
  instructorName: z.string(),
  vehicleId: z.uuid().nullable(),
});
export type FreeSlot = z.infer<typeof freeSlotSchema>;

export const freeSlotsResponseSchema = z.object({ items: z.array(freeSlotSchema) });
export type FreeSlotsResponse = z.infer<typeof freeSlotsResponseSchema>;

const windowFields = {
  weekday: weekdaySchema,
  startTime: localTimeSchema,
  endTime: localTimeSchema,
};
const startTimeBeforeEndTime = (window: { startTime: string; endTime: string }) =>
  window.startTime < window.endTime;
const START_TIME_BEFORE_END_TIME = {
  message: 'startTime must be before endTime',
  path: ['endTime'],
};

export const weeklyWindowSchema = z
  .object(windowFields)
  .refine(startTimeBeforeEndTime, START_TIME_BEFORE_END_TIME);
export type WeeklyWindow = z.infer<typeof weeklyWindowSchema>;

export const availabilityWindowSchema = z.object({
  id: z.uuid(),
  ...windowFields,
  validFrom: dateSchema,
  validTo: dateSchema.nullable(),
});
export type AvailabilityWindow = z.infer<typeof availabilityWindowSchema>;

export const timeOffSchema = z.object({
  id: z.uuid(),
  start: dateTimeSchema,
  end: dateTimeSchema,
  reason: z.string(),
});
export type TimeOff = z.infer<typeof timeOffSchema>;

export const availabilityResponseSchema = z.object({
  instructorMembershipId: z.uuid(),
  items: z.array(availabilityWindowSchema),
  timeOff: z.array(timeOffSchema),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

export const replaceAvailabilityRequestSchema = z
  .strictObject({
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.optional(),
    windows: z
      .array(
        z.strictObject(windowFields).refine(startTimeBeforeEndTime, START_TIME_BEFORE_END_TIME),
      )
      .max(70),
  })
  .refine((body) => body.effectiveTo === undefined || body.effectiveFrom <= body.effectiveTo, {
    message: 'effectiveTo must not be before effectiveFrom',
    path: ['effectiveTo'],
  });
export type ReplaceAvailabilityRequest = z.infer<typeof replaceAvailabilityRequestSchema>;

export const addTimeOffRequestSchema = z
  .strictObject({
    start: dateTimeSchema,
    end: dateTimeSchema,
    reason: z.string().trim().max(500).default(''),
  })
  .refine(startBeforeEnd, START_BEFORE_END);
export type AddTimeOffRequest = z.infer<typeof addTimeOffRequestSchema>;

const pickupFields = {
  pickupAddress: z.string().trim().min(1).max(500).optional(),
  pickupLat: latitudeSchema.optional(),
  pickupLng: longitudeSchema.optional(),
};

export const bookLessonRequestSchema = z.strictObject({
  studentId: z.uuid(),
  instructorMembershipId: z.uuid(),
  lessonTypeId: z.uuid(),
  vehicleId: z.uuid().nullable().optional(),
  start: dateTimeSchema,
  ...pickupFields,
});
export type BookLessonRequest = z.infer<typeof bookLessonRequestSchema>;

export const moveLessonRequestSchema = z
  .strictObject({
    start: dateTimeSchema.optional(),
    instructorMembershipId: z.uuid().optional(),
    vehicleId: z.uuid().nullable().optional(),
    lessonTypeId: z.uuid().optional(),
    ...pickupFields,
    version: versionSchema.optional(),
  })
  .refine(({ version: _version, ...changes }) => hasSomeField(changes), {
    message: NO_FIELDS_MESSAGE,
  });
export type MoveLessonRequest = z.infer<typeof moveLessonRequestSchema>;

export const cancelLessonRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500).optional(),
  version: versionSchema.optional(),
  restoreCredit: z.boolean().optional(),
});
export type CancelLessonRequest = z.infer<typeof cancelLessonRequestSchema>;

export const cancelLessonResponseSchema = z.object({
  id: z.uuid(),
  version: versionSchema,
  late: z.boolean(),
  minutesRestored: z.number().int().nonnegative(),
});
export type CancelLessonResponse = z.infer<typeof cancelLessonResponseSchema>;

export const progressInputSchema = z.strictObject({
  syllabusItemId: z.uuid(),
  level: progressLevelSchema,
  note: z.string().trim().max(2000).default(''),
});
export type ProgressInput = z.infer<typeof progressInputSchema>;

export const completeLessonRequestSchema = z.strictObject({
  progress: z.array(progressInputSchema).max(100).default([]),
  privateNote: z.string().trim().min(1).max(5000).optional(),
  version: versionSchema.optional(),
});
export type CompleteLessonRequest = z.infer<typeof completeLessonRequestSchema>;

export const markNoShowRequestSchema = z.strictObject({
  version: versionSchema.optional(),
});
export type MarkNoShowRequest = z.infer<typeof markNoShowRequestSchema>;

export const SYNC_PULL_LIMIT_MAX = 500;
export const SYNC_PULL_LIMIT_DEFAULT = 200;

export const syncPullQuerySchema = z.object({
  cursor: z
    .string()
    .regex(/^\d{1,19}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(SYNC_PULL_LIMIT_MAX).default(SYNC_PULL_LIMIT_DEFAULT),
});
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

export const syncStudentSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  licenceClass: licenceClassSchema,
  area: z.string().nullable(),
  pickupAddress: z.string().nullable(),
  pickupLat: latitudeSchema.nullable(),
  pickupLng: longitudeSchema.nullable(),
  isPrimary: z.boolean(),
});
export type SyncStudent = z.infer<typeof syncStudentSchema>;

export const syncProgressEntrySchema = z.object({
  id: z.uuid(),
  lessonId: z.uuid(),
  studentId: z.uuid(),
  syllabusItemId: z.uuid(),
  level: progressLevelSchema,
  note: z.string(),
  version: versionSchema,
});
export type SyncProgressEntry = z.infer<typeof syncProgressEntrySchema>;

export const syncAvailabilitySchema = availabilityResponseSchema.omit({ timeOff: true });
export type SyncAvailability = z.infer<typeof syncAvailabilitySchema>;

export const syncEntitySchema = z.enum([
  'lesson',
  'student',
  'vehicle',
  'progress_entry',
  'availability',
]);
export type SyncEntity = z.infer<typeof syncEntitySchema>;

const changeBase = { seq: z.string().regex(/^\d{1,19}$/), entityId: z.uuid(), at: dateTimeSchema };

export const syncChangeSchema = z.union([
  z.discriminatedUnion('entity', [
    z.object({
      ...changeBase,
      op: z.literal('upsert'),
      entity: z.literal('lesson'),
      data: lessonResponseSchema,
    }),
    z.object({
      ...changeBase,
      op: z.literal('upsert'),
      entity: z.literal('student'),
      data: syncStudentSchema,
    }),
    z.object({
      ...changeBase,
      op: z.literal('upsert'),
      entity: z.literal('vehicle'),
      data: vehicleSchema,
    }),
    z.object({
      ...changeBase,
      op: z.literal('upsert'),
      entity: z.literal('progress_entry'),
      data: syncProgressEntrySchema,
    }),
    z.object({
      ...changeBase,
      op: z.literal('upsert'),
      entity: z.literal('availability'),
      data: syncAvailabilitySchema,
    }),
  ]),
  z.object({
    ...changeBase,
    op: changeFeedOpSchema.exclude(['upsert']),
    entity: syncEntitySchema,
    data: z.null(),
  }),
]);
export type SyncChange = z.infer<typeof syncChangeSchema>;

export const syncPullResponseSchema = z.object({
  items: z.array(syncChangeSchema),
  nextCursor: z.string().regex(/^\d{1,19}$/),
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

export const SYNC_OP_TYPES = [
  'lesson.create',
  'lesson.move',
  'lesson.cancel',
  'lesson.complete',
  'lesson.no_show',
  'progress.upsert',
  'private_note.upsert',
  'payment.cash',
] as const;
export type SyncOpType = (typeof SYNC_OP_TYPES)[number];

const opBase = { opId: z.uuid(), clientAt: dateTimeSchema };
const lessonVersion = { baseVersion: versionSchema };
const noVersion = { baseVersion: z.null() };

export const syncOpSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...opBase,
    ...noVersion,
    type: z.literal('lesson.create'),
    payload: z.strictObject({
      lessonId: z.uuid(),
      studentId: z.uuid(),
      lessonTypeId: z.uuid(),
      vehicleId: z.uuid().nullable(),
      start: dateTimeSchema,
      ...pickupFields,
    }),
  }),
  z.strictObject({
    ...opBase,
    ...lessonVersion,
    type: z.literal('lesson.move'),
    payload: z.strictObject({
      lessonId: z.uuid(),
      start: dateTimeSchema,
      vehicleId: z.uuid().nullable().optional(),
      lessonTypeId: z.uuid().optional(),
    }),
  }),
  z.strictObject({
    ...opBase,
    ...lessonVersion,
    type: z.literal('lesson.cancel'),
    payload: z.strictObject({
      lessonId: z.uuid(),
      reason: z.string().trim().min(1).max(500).optional(),
    }),
  }),
  z.strictObject({
    ...opBase,
    ...lessonVersion,
    type: z.literal('lesson.complete'),
    payload: z.strictObject({ lessonId: z.uuid() }),
  }),
  z.strictObject({
    ...opBase,
    ...lessonVersion,
    type: z.literal('lesson.no_show'),
    payload: z.strictObject({ lessonId: z.uuid() }),
  }),
  z.strictObject({
    ...opBase,
    ...noVersion,
    type: z.literal('progress.upsert'),
    payload: z.strictObject({
      progressEntryId: z.uuid(),
      lessonId: z.uuid(),
      syllabusItemId: z.uuid(),
      level: progressLevelSchema,
      note: z.string().trim().max(2000),
    }),
  }),
  z.strictObject({
    ...opBase,
    ...noVersion,
    type: z.literal('private_note.upsert'),
    payload: z.strictObject({
      privateNoteId: z.uuid(),
      lessonId: z.uuid(),
      body: z.string().trim().min(1).max(5000),
    }),
  }),
  z.strictObject({
    ...opBase,
    ...noVersion,
    type: z.literal('payment.cash'),
    payload: z.strictObject({
      paymentId: z.uuid(),
      studentId: z.uuid(),
      priceItemId: z.uuid(),
      amountMinor: amountMinorSchema.positive(),
      currency: currencySchema,
    }),
  }),
]);
export type SyncOp = z.infer<typeof syncOpSchema>;

export const SYNC_PUSH_MAX_OPS = 100;

export const syncPushRequestSchema = z.strictObject({
  ops: z.array(syncOpSchema).min(1).max(SYNC_PUSH_MAX_OPS),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncOpResultSchema = z.object({
  opId: z.uuid(),
  status: syncOperationStatusSchema,
  id: z.uuid().nullable(),
  version: versionSchema.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  serverState: lessonResponseSchema.nullable(),
});
export type SyncOpResult = z.infer<typeof syncOpResultSchema>;

export const syncPushResponseSchema = z.object({ results: z.array(syncOpResultSchema) });
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const preferredWindowSchema = z
  .object({ weekday: weekdaySchema, start: localTimeSchema, end: localTimeSchema })
  .refine((window) => window.start < window.end, START_BEFORE_END);
export type PreferredWindow = z.infer<typeof preferredWindowSchema>;

export const waitingListEntrySchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  lessonTypeId: z.uuid(),
  preferredWindows: z.array(preferredWindowSchema),
  area: z.string(),
  active: z.boolean(),
  createdAt: dateTimeSchema,
});
export type WaitingListEntry = z.infer<typeof waitingListEntrySchema>;

export const listWaitingListQuerySchema = pageQuerySchema.extend({
  studentId: z.uuid().optional(),
  lessonTypeId: z.uuid().optional(),
  active: booleanQuerySchema.optional(),
});
export type ListWaitingListQuery = z.infer<typeof listWaitingListQuerySchema>;

export const waitingListResponseSchema = pageResponseSchema(waitingListEntrySchema);
export type WaitingListResponse = z.infer<typeof waitingListResponseSchema>;

export const joinWaitingListRequestSchema = z.strictObject({
  studentId: z.uuid(),
  lessonTypeId: z.uuid(),
  preferredWindows: z.array(preferredWindowSchema).min(1).max(21),
  area: z.string().trim().min(1).max(100),
});
export type JoinWaitingListRequest = z.infer<typeof joinWaitingListRequestSchema>;

export const slotOfferSchema = z.object({
  id: z.uuid(),
  instructorMembershipId: z.uuid(),
  instructorName: z.string(),
  vehicleId: z.uuid().nullable(),
  lessonTypeId: z.uuid(),
  lessonTypeName: z.string(),
  creditMinutes: creditMinutesSchema,
  start: dateTimeSchema,
  end: dateTimeSchema,
  source: slotOfferSourceSchema,
  status: slotOfferStatusSchema,
  expiresAt: dateTimeSchema,
});
export type SlotOffer = z.infer<typeof slotOfferSchema>;

export const listSlotOffersQuerySchema = pageQuerySchema.extend({
  status: slotOfferStatusSchema.optional(),
});
export type ListSlotOffersQuery = z.infer<typeof listSlotOffersQuerySchema>;

export const slotOfferListResponseSchema = pageResponseSchema(slotOfferSchema);
export type SlotOfferListResponse = z.infer<typeof slotOfferListResponseSchema>;

export const createSlotOfferRequestSchema = z.strictObject({
  instructorMembershipId: z.uuid(),
  vehicleId: z.uuid().nullable().optional(),
  lessonTypeId: z.uuid(),
  start: dateTimeSchema,
  studentIds: z.array(z.uuid()).min(1).max(200).optional(),
});
export type CreateSlotOfferRequest = z.infer<typeof createSlotOfferRequestSchema>;

export const acceptSlotOfferRequestSchema = z.strictObject({
  studentId: z.uuid().optional(),
});
export type AcceptSlotOfferRequest = z.infer<typeof acceptSlotOfferRequestSchema>;
