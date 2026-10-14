import { z } from 'zod';
import {
  amountMinorSchema,
  commandResultSchema,
  currencySchema,
  dateSchema,
  dateTimeSchema,
  hasSomeField,
  latitudeSchema,
  licenceClassSchema,
  localeSchema,
  longitudeSchema,
  minutesSchema,
  NO_FIELDS_MESSAGE,
  pageQuerySchema,
  pageResponseSchema,
} from './common.js';
import {
  documentKindSchema,
  invoiceKindSchema,
  invoiceStatusSchema,
  ledgerEntryTypeSchema,
  lessonStatusSchema,
  studentStatusSchema,
  testAttemptKindSchema,
  testAttemptResultSchema,
} from './enums.js';

export const PROGRESS_LEVEL_MIN = 1;
export const PROGRESS_LEVEL_MAX = 5;

export const progressLevelSchema = z.number().int().min(PROGRESS_LEVEL_MIN).max(PROGRESS_LEVEL_MAX);
export type ProgressLevel = z.infer<typeof progressLevelSchema>;

export const studentListItemSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  licenceClass: licenceClassSchema,
  status: studentStatusSchema,
  primaryInstructorName: z.string().nullable(),
  balanceMinutes: minutesSchema,
  nextLessonAt: dateTimeSchema.nullable(),
  lastLessonAt: dateTimeSchema.nullable(),
  progressPct: z.number().int().min(0).max(100),
  updatedAt: dateTimeSchema,
});
export type StudentListItem = z.infer<typeof studentListItemSchema>;

export const listStudentsQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: studentStatusSchema.optional(),
  instructorId: z.uuid().optional(),
});
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

export const studentListResponseSchema = pageResponseSchema(studentListItemSchema);
export type StudentListResponse = z.infer<typeof studentListResponseSchema>;

export const enrolmentSchema = z.object({
  id: z.uuid(),
  courseName: z.string(),
  licenceClass: licenceClassSchema,
  startedAt: dateTimeSchema,
  endedAt: dateTimeSchema.nullable(),
});
export type Enrolment = z.infer<typeof enrolmentSchema>;

export const studentInstructorSchema = z.object({
  assignmentId: z.uuid(),
  instructorMembershipId: z.uuid(),
  instructorName: z.string(),
  isPrimary: z.boolean(),
  assignedAt: dateTimeSchema,
});
export type StudentInstructor = z.infer<typeof studentInstructorSchema>;

export const guardianLinkSchema = z.object({
  id: z.uuid(),
  guardianUserId: z.uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  consentAt: dateTimeSchema.nullable(),
  consentTextVersion: z.string().nullable(),
  revokedAt: dateTimeSchema.nullable(),
});
export type GuardianLink = z.infer<typeof guardianLinkSchema>;

export const guardianLinkStatusSchema = z.enum(['pending_consent', 'consented', 'not_required']);
export type GuardianLinkStatus = z.infer<typeof guardianLinkStatusSchema>;

export const myGuardianLinkSchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  status: guardianLinkStatusSchema,
  consentAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
});
export type MyGuardianLink = z.infer<typeof myGuardianLinkSchema>;

export const listGuardianLinksQuerySchema = pageQuerySchema;
export type ListGuardianLinksQuery = z.infer<typeof listGuardianLinksQuerySchema>;

export const guardianLinkListResponseSchema = pageResponseSchema(myGuardianLinkSchema);
export type GuardianLinkListResponse = z.infer<typeof guardianLinkListResponseSchema>;

export const studentResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid().nullable(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  dateOfBirth: dateSchema,
  isMinor: z.boolean(),
  licenceClass: licenceClassSchema,
  examLanguage: localeSchema,
  testDate: dateSchema.nullable(),
  area: z.string().nullable(),
  pickupAddress: z.string().nullable(),
  pickupLat: latitudeSchema.nullable(),
  pickupLng: longitudeSchema.nullable(),
  status: studentStatusSchema,
  enrolments: z.array(enrolmentSchema),
  instructors: z.array(studentInstructorSchema),
  guardians: z.array(guardianLinkSchema),
});
export type StudentResponse = z.infer<typeof studentResponseSchema>;

const studentFields = {
  fullName: z.string().trim().min(1).max(200),
  dateOfBirth: dateSchema,
  licenceClass: licenceClassSchema,
  examLanguage: localeSchema,
};

const optionalStudentFields = {
  testDate: dateSchema.nullable(),
  area: z.string().trim().min(1).max(100).nullable(),
  pickupAddress: z.string().trim().min(1).max(500).nullable(),
  pickupLat: latitudeSchema.nullable(),
  pickupLng: longitudeSchema.nullable(),
};

const enrolmentFields = {
  courseName: z.string().trim().min(1).max(200),
  licenceClass: licenceClassSchema,
};

export const createStudentRequestSchema = z
  .strictObject({
    ...studentFields,
    ...optionalStudentFields,
    primaryInstructorMembershipId: z.uuid(),
    enrolment: z.strictObject(enrolmentFields),
  })
  .partial({
    testDate: true,
    area: true,
    pickupAddress: true,
    pickupLat: true,
    pickupLng: true,
    primaryInstructorMembershipId: true,
    enrolment: true,
  });
export type CreateStudentRequest = z.infer<typeof createStudentRequestSchema>;

export const updateStudentRequestSchema = z
  .strictObject({ ...studentFields, ...optionalStudentFields })
  .partial()
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdateStudentRequest = z.infer<typeof updateStudentRequestSchema>;

export const studentInstructorsResponseSchema = z.object({
  items: z.array(studentInstructorSchema),
});
export type StudentInstructorsResponse = z.infer<typeof studentInstructorsResponseSchema>;

export const replaceStudentInstructorsRequestSchema = z
  .strictObject({
    instructors: z
      .array(z.strictObject({ instructorMembershipId: z.uuid(), isPrimary: z.boolean() }))
      .max(20),
  })
  .refine(
    (body) =>
      body.instructors.length === 0 || body.instructors.filter((row) => row.isPrimary).length === 1,
    { message: 'Exactly one primary instructor', path: ['instructors'] },
  )
  .refine(
    (body) =>
      new Set(body.instructors.map((row) => row.instructorMembershipId)).size ===
      body.instructors.length,
    { message: 'Each instructor once', path: ['instructors'] },
  );
export type ReplaceStudentInstructorsRequest = z.infer<
  typeof replaceStudentInstructorsRequestSchema
>;

export const createEnrolmentRequestSchema = z.strictObject({
  ...enrolmentFields,
  startedAt: dateTimeSchema.optional(),
});
export type CreateEnrolmentRequest = z.infer<typeof createEnrolmentRequestSchema>;

export const syllabusItemSchema = z.object({
  id: z.uuid(),
  licenceClass: licenceClassSchema,
  code: z.string(),
  title: z.string(),
  sortOrder: z.number().int(),
});
export type SyllabusItem = z.infer<typeof syllabusItemSchema>;

export const syllabusQuerySchema = z.object({
  licenceClass: licenceClassSchema.optional(),
});
export type SyllabusQuery = z.infer<typeof syllabusQuerySchema>;

export const syllabusResponseSchema = z.object({ items: z.array(syllabusItemSchema) });
export type SyllabusResponse = z.infer<typeof syllabusResponseSchema>;

export const syllabusProgressSchema = z.object({
  syllabusItemId: z.uuid(),
  code: z.string(),
  title: z.string(),
  sortOrder: z.number().int(),
  level: progressLevelSchema.nullable(),
  lastNote: z.string().nullable(),
  lessonCount: z.number().int().nonnegative(),
  updatedAt: dateTimeSchema.nullable(),
});
export type SyllabusProgress = z.infer<typeof syllabusProgressSchema>;

export const progressEntrySchema = z.object({
  id: z.uuid(),
  lessonId: z.uuid(),
  lessonStart: dateTimeSchema,
  instructorName: z.string(),
  syllabusItemId: z.uuid(),
  level: progressLevelSchema,
  note: z.string(),
  version: z.number().int().positive(),
});
export type ProgressEntry = z.infer<typeof progressEntrySchema>;

export const testAttemptSchema = z.object({
  id: z.uuid(),
  kind: testAttemptKindSchema,
  takenOn: dateSchema,
  result: testAttemptResultSchema,
  notes: z.string(),
});
export type TestAttempt = z.infer<typeof testAttemptSchema>;

export const studentProgressResponseSchema = z.object({
  studentId: z.uuid(),
  licenceClass: licenceClassSchema,
  progressPct: z.number().int().min(0).max(100),
  syllabus: z.array(syllabusProgressSchema),
  entries: z.array(progressEntrySchema),
  testAttempts: z.array(testAttemptSchema),
});
export type StudentProgressResponse = z.infer<typeof studentProgressResponseSchema>;

export const recordTestAttemptRequestSchema = z.strictObject({
  kind: testAttemptKindSchema,
  takenOn: dateSchema,
  result: testAttemptResultSchema,
  notes: z.string().trim().max(2000).default(''),
});
export type RecordTestAttemptRequest = z.infer<typeof recordTestAttemptRequestSchema>;

export const linkGuardianRequestSchema = z
  .strictObject({
    guardianUserId: z.uuid().optional(),
    phone: z.string().trim().min(3).max(32).optional(),
    email: z.string().trim().min(3).max(254).optional(),
  })
  .superRefine((body, ctx) => {
    const byContact = body.phone !== undefined || body.email !== undefined;
    if (body.guardianUserId === undefined && !byContact) {
      ctx.addIssue({
        code: 'custom',
        path: ['guardianUserId'],
        message: 'Give a guardian user, a phone or an email',
      });
    }
    if (body.guardianUserId !== undefined && byContact) {
      ctx.addIssue({
        code: 'custom',
        path: ['guardianUserId'],
        message: 'Give either a guardian user or a contact',
      });
    }
  });
export type LinkGuardianRequest = z.infer<typeof linkGuardianRequestSchema>;

export const linkGuardianResponseSchema = commandResultSchema.extend({
  pending: z.boolean(),
});
export type LinkGuardianResponse = z.infer<typeof linkGuardianResponseSchema>;

export const giveGuardianConsentRequestSchema = z.strictObject({
  consentTextVersion: z.string().trim().min(1).max(50),
});
export type GiveGuardianConsentRequest = z.infer<typeof giveGuardianConsentRequestSchema>;

export const privateNoteSchema = z.object({
  id: z.uuid(),
  lessonId: z.uuid(),
  authorMembershipId: z.uuid(),
  authorName: z.string(),
  body: z.string(),
  version: z.number().int().positive(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type PrivateNote = z.infer<typeof privateNoteSchema>;

export const privateNoteListResponseSchema = z.object({ items: z.array(privateNoteSchema) });
export type PrivateNoteListResponse = z.infer<typeof privateNoteListResponseSchema>;

export const privateNoteParamsSchema = z.object({ id: z.uuid(), lessonId: z.uuid() });
export type PrivateNoteParams = z.infer<typeof privateNoteParamsSchema>;

export const upsertPrivateNoteRequestSchema = z.strictObject({
  body: z.string().trim().min(1).max(5000),
});
export type UpsertPrivateNoteRequest = z.infer<typeof upsertPrivateNoteRequestSchema>;

export const studentExportBundleSchema = z.object({
  exportedAt: dateTimeSchema,
  student: studentResponseSchema.omit({ guardians: true }),
  guardians: z.array(
    z.object({
      fullName: z.string(),
      consentAt: dateTimeSchema.nullable(),
      consentTextVersion: z.string().nullable(),
      revokedAt: dateTimeSchema.nullable(),
    }),
  ),
  lessons: z.array(
    z.object({
      lessonId: z.uuid(),
      start: dateTimeSchema,
      end: dateTimeSchema,
      status: lessonStatusSchema,
      instructorName: z.string(),
    }),
  ),
  progress: studentProgressResponseSchema,
  invoices: z.array(
    z.object({
      id: z.uuid(),
      kind: invoiceKindSchema,
      formattedNumber: z.string().nullable(),
      status: invoiceStatusSchema,
      issuedAt: dateTimeSchema.nullable(),
      totalMinor: amountMinorSchema,
      currency: currencySchema,
    }),
  ),
  ledger: z.array(
    z.object({
      id: z.uuid(),
      entryType: ledgerEntryTypeSchema,
      minutes: minutesSchema,
      balanceAfter: minutesSchema,
      paymentId: z.uuid().nullable(),
      createdAt: dateTimeSchema,
    }),
  ),
  documents: z.array(
    z.object({
      id: z.uuid(),
      kind: documentKindSchema,
      createdAt: dateTimeSchema,
    }),
  ),
});
export type StudentExportBundle = z.infer<typeof studentExportBundleSchema>;

export const studentExportResponseSchema = z.object({
  bundle: studentExportBundleSchema,
  pdfBase64: z.string().min(1),
});
export type StudentExportResponse = z.infer<typeof studentExportResponseSchema>;

export const archiveStudentRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type ArchiveStudentRequest = z.infer<typeof archiveStudentRequestSchema>;
