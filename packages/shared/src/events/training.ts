import { z } from 'zod';
import { dateSchema, dateTimeSchema, licenceClassSchema, localeSchema } from '../dto/common.js';
import {
  leadSourceSchema,
  leadStatusSchema,
  studentStatusSchema,
  testAttemptKindSchema,
  testAttemptResultSchema,
} from '../dto/enums.js';
import { progressLevelSchema } from '../dto/training.js';
import { defineEvent } from './define-event.js';

export const StudentCreated = defineEvent({
  type: 'StudentCreated',
  version: 1,
  schema: z.object({
    studentId: z.uuid(),
    userId: z.uuid().nullable(),
    fullName: z.string().min(1),
    licenceClass: licenceClassSchema,
    examLanguage: localeSchema,
    testDate: dateSchema.nullable(),
    area: z.string().nullable(),
    status: studentStatusSchema,
  }),
});

export const StudentEnrolled = defineEvent({
  type: 'StudentEnrolled',
  version: 1,
  schema: z.object({
    studentId: z.uuid(),
    enrolmentId: z.uuid(),
    courseName: z.string().min(1),
    licenceClass: licenceClassSchema,
    firstEnrolment: z.boolean(),
    startedAt: dateTimeSchema,
  }),
});

export const StudentArchived = defineEvent({
  type: 'StudentArchived',
  version: 1,
  schema: z.object({
    studentId: z.uuid(),
    archivedAt: dateTimeSchema,
    completedLessons: z.number().int().nonnegative(),
  }),
});

export const StudentAnonymized = defineEvent({
  type: 'StudentAnonymized',
  version: 1,
  schema: z.object({
    studentId: z.uuid(),
    userId: z.uuid().nullable(),
    userAnonymized: z.boolean(),
    anonymizedAt: dateTimeSchema,
  }),
});

export const GuardianLinked = defineEvent({
  type: 'GuardianLinked',
  version: 1,
  schema: z.object({
    guardianLinkId: z.uuid(),
    studentId: z.uuid(),
    guardianUserId: z.uuid(),
    studentUserId: z.uuid().nullable(),
    consentRequired: z.boolean(),
  }),
});

export const GuardianConsentGiven = defineEvent({
  type: 'GuardianConsentGiven',
  version: 1,
  schema: z.object({
    schoolId: z.uuid(),
    studentId: z.uuid(),
    guardianLinkId: z.uuid(),
    guardianUserId: z.uuid(),
    studentUserId: z.uuid().nullable(),
    consentTextVersion: z.string().min(1),
  }),
});

export const InstructorAssigned = defineEvent({
  type: 'InstructorAssigned',
  version: 1,
  schema: z.object({
    assignmentId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    instructorName: z.string().min(1),
    isPrimary: z.boolean(),
    assignedAt: dateTimeSchema,
  }),
});

export const InstructorUnassigned = defineEvent({
  type: 'InstructorUnassigned',
  version: 1,
  schema: z.object({
    assignmentId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    wasPrimary: z.boolean(),
    unassignedAt: dateTimeSchema,
  }),
});

export const ProgressRecorded = defineEvent({
  type: 'ProgressRecorded',
  version: 1,
  schema: z.object({
    lessonId: z.uuid(),
    studentId: z.uuid(),
    instructorMembershipId: z.uuid(),
    entries: z
      .array(
        z.object({
          progressEntryId: z.uuid(),
          syllabusItemId: z.uuid(),
          level: progressLevelSchema,
          version: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
});

export const TestAttemptRecorded = defineEvent({
  type: 'TestAttemptRecorded',
  version: 1,
  schema: z.object({
    testAttemptId: z.uuid(),
    studentId: z.uuid(),
    kind: testAttemptKindSchema,
    takenOn: dateSchema,
    result: testAttemptResultSchema,
  }),
});

export const LeadCaptured = defineEvent({
  type: 'LeadCaptured',
  version: 1,
  schema: z.object({
    leadId: z.uuid(),
    source: leadSourceSchema,
    licenceClass: licenceClassSchema,
    isMinor: z.boolean(),
    fullName: z.string().min(1),
    capturedAt: dateTimeSchema,
  }),
});

export const LeadStatusChanged = defineEvent({
  type: 'LeadStatusChanged',
  version: 1,
  schema: z.object({
    leadId: z.uuid(),
    status: leadStatusSchema.extract(['contacted', 'lost']),
    changedAt: dateTimeSchema,
  }),
});

export const LeadConverted = defineEvent({
  type: 'LeadConverted',
  version: 1,
  schema: z.object({
    leadId: z.uuid(),
    studentId: z.uuid(),
    convertedAt: dateTimeSchema,
  }),
});
