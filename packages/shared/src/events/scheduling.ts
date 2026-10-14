import { z } from 'zod';
import { dateSchema, dateTimeSchema, minutesSchema } from '../dto/common.js';
import { bookedViaSchema, slotOfferSourceSchema } from '../dto/enums.js';
import { membershipRoleSchema } from '../dto/identity.js';
import { preferredWindowSchema, weeklyWindowSchema } from '../dto/scheduling.js';
import { defineEvent } from './define-event.js';

export const LessonBooked = defineEvent({
  type: 'LessonBooked',
  version: 1,
  schema: z.object({
    lessonId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    vehicleId: z.uuid().nullable(),
    lessonTypeId: z.uuid(),
    creditMinutes: minutesSchema,
    start: dateTimeSchema,
    end: dateTimeSchema,
    bookedVia: bookedViaSchema,
    bookedByMembershipId: z.uuid(),
    pickupAddress: z.string().optional(),
  }),
});

export const LessonMoved = defineEvent({
  type: 'LessonMoved',
  version: 1,
  schema: z.object({
    lessonId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    vehicleId: z.uuid().nullable(),
    lessonTypeId: z.uuid(),
    creditMinutes: minutesSchema,
    start: dateTimeSchema,
    end: dateTimeSchema,
    previousStart: dateTimeSchema,
    previousEnd: dateTimeSchema,
    previousInstructorMembershipId: z.uuid(),
    previousVehicleId: z.uuid().nullable(),
    creditMinutesDelta: minutesSchema,
    lateCancellation: z.boolean().optional(),
    movedByMembershipId: z.uuid(),
  }),
});

export const LessonCancelled = defineEvent({
  type: 'LessonCancelled',
  version: 1,
  schema: z.object({
    lessonId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    vehicleId: z.uuid().nullable(),
    lessonTypeId: z.uuid(),
    creditMinutes: minutesSchema,
    start: dateTimeSchema,
    end: dateTimeSchema,
    late: z.boolean(),
    byRole: membershipRoleSchema,
    minutesRestored: z.number().int().nonnegative(),
    cancelledByMembershipId: z.uuid(),
    reason: z.string().optional(),
  }),
});

export const LessonCompleted = defineEvent({
  type: 'LessonCompleted',
  version: 1,
  schema: z.object({
    lessonId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    lessonTypeId: z.uuid(),
    start: dateTimeSchema,
    end: dateTimeSchema,
    creditMinutes: minutesSchema,
  }),
});

export const LessonMarkedNoShow = defineEvent({
  type: 'LessonMarkedNoShow',
  version: 1,
  schema: z.object({
    lessonId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    lessonTypeId: z.uuid(),
    start: dateTimeSchema,
    end: dateTimeSchema,
    creditMinutes: minutesSchema,
    markedByMembershipId: z.uuid(),
  }),
});

export const AvailabilityChanged = defineEvent({
  type: 'AvailabilityChanged',
  version: 1,
  schema: z.object({
    instructorMembershipId: z.uuid(),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.optional(),
    windows: z.array(weeklyWindowSchema),
  }),
});

export const TimeOffAdded = defineEvent({
  type: 'TimeOffAdded',
  version: 1,
  schema: z.object({
    timeOffId: z.uuid(),
    instructorMembershipId: z.uuid(),
    start: dateTimeSchema,
    end: dateTimeSchema,
  }),
});

export const WaitingListJoined = defineEvent({
  type: 'WaitingListJoined',
  version: 1,
  schema: z.object({
    waitingListEntryId: z.uuid(),
    studentId: z.uuid(),
    lessonTypeId: z.uuid(),
    preferredWindows: z.array(preferredWindowSchema).min(1),
    area: z.string().min(1),
  }),
});

export const SlotOfferCreated = defineEvent({
  type: 'SlotOfferCreated',
  version: 1,
  schema: z.object({
    offerId: z.uuid(),
    instructorMembershipId: z.uuid(),
    vehicleId: z.uuid().nullable(),
    lessonTypeId: z.uuid(),
    creditMinutes: minutesSchema,
    start: dateTimeSchema,
    end: dateTimeSchema,
    source: slotOfferSourceSchema,
    offeredToStudentIds: z.array(z.uuid()),
    expiresAt: dateTimeSchema,
  }),
});

export const SlotOfferAccepted = defineEvent({
  type: 'SlotOfferAccepted',
  version: 1,
  schema: z.object({
    offerId: z.uuid(),
    lessonId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    source: slotOfferSourceSchema,
    start: dateTimeSchema,
    end: dateTimeSchema,
    creditMinutes: minutesSchema,
  }),
});

export const SlotOfferExpired = defineEvent({
  type: 'SlotOfferExpired',
  version: 1,
  schema: z.object({
    offerId: z.uuid(),
    instructorMembershipId: z.uuid(),
    source: slotOfferSourceSchema,
    start: dateTimeSchema,
    end: dateTimeSchema,
    offeredToStudentIds: z.array(z.uuid()),
    expiredAt: dateTimeSchema,
  }),
});
