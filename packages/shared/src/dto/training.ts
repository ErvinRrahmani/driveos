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
  phoneSchema,
} from './common.js';
import {
  documentKindSchema,
  invoiceKindSchema,
  invoiceStatusSchema,
  leadSourceSchema,
  leadStatusSchema,
  ledgerEntryTypeSchema,
  lessonStatusSchema,
  studentStatusSchema,
  testAttemptKindSchema,
  testAttemptResultSchema,
} from './enums.js';
import { LEAD_CONSENT_TEXT_VERSIONS, MANUAL_LEAD_CONSENT_VERSION } from './school.js';

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

/** A lead keeps its first enquiry and the newest ones up to this many. */
export const LEAD_ENQUIRY_MAX = 50;

/** One enquiry on a lead: the first capture and every repeat within the dedupe window. */
export const leadEnquirySchema = z.object({
  message: z.string().nullable(),
  receivedAt: dateTimeSchema,
  source: leadSourceSchema,
});
export type LeadEnquiry = z.infer<typeof leadEnquirySchema>;

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
  /** The enquiry (or enquiries) the student was converted from. */
  leads: z.array(
    z.object({
      id: z.uuid(),
      source: leadSourceSchema,
      status: leadStatusSchema,
      fullName: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      licenceClass: licenceClassSchema,
      message: z.string().nullable(),
      isMinor: z.boolean(),
      guardianName: z.string().nullable(),
      guardianContact: z.string().nullable(),
      consentTextVersion: z.string(),
      consentedAt: dateTimeSchema,
      enquiries: z.array(leadEnquirySchema),
      note: z.string().nullable(),
      createdAt: dateTimeSchema,
      convertedAt: dateTimeSchema.nullable(),
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

export const LEAD_FULL_NAME_MAX = 120;
export const LEAD_MESSAGE_MAX = 1000;
export const LEAD_NOTE_MAX = 2000;
export const LEAD_LOST_REASON_MAX = 200;

const leadFields = {
  fullName: z.string().trim().min(1).max(LEAD_FULL_NAME_MAX),
  phone: phoneSchema.optional(),
  email: z.email().max(254).optional(),
  licenceClass: licenceClassSchema,
  message: z.string().trim().min(1).max(LEAD_MESSAGE_MAX).optional(),
  isMinor: z.boolean(),
  guardianName: z.string().trim().min(1).max(LEAD_FULL_NAME_MAX).optional(),
  /** A phone (E.164) or an email: conversion invites the guardian at this contact. */
  guardianContact: z.union([phoneSchema, z.email().max(254)]).optional(),
  consentTextVersion: z.enum(LEAD_CONSENT_TEXT_VERSIONS),
};

interface LeadContact {
  phone?: string | undefined;
  email?: string | undefined;
  isMinor: boolean;
  guardianName?: string | undefined;
  guardianContact?: string | undefined;
}

/** A lead needs a phone or an email; a minor's lead needs the guardian's name and contact. */
function refineLeadContact(body: LeadContact, ctx: z.RefinementCtx): void {
  if (body.phone === undefined && body.email === undefined) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Give a phone or an email' });
  }
  if (body.isMinor && body.guardianName === undefined) {
    ctx.addIssue({ code: 'custom', path: ['guardianName'], message: 'Required for a minor' });
  }
  if (body.isMinor && body.guardianContact === undefined) {
    ctx.addIssue({ code: 'custom', path: ['guardianContact'], message: 'Required for a minor' });
  }
}

export const captureLeadRequestSchema = z
  .strictObject({ ...leadFields, website: z.string().max(200).optional() })
  .superRefine(refineLeadContact);
export type CaptureLeadRequest = z.infer<typeof captureLeadRequestSchema>;

export const createLeadRequestSchema = z
  .strictObject({
    ...leadFields,
    consentTextVersion: z
      .enum([...LEAD_CONSENT_TEXT_VERSIONS, MANUAL_LEAD_CONSENT_VERSION])
      .optional(),
  })
  .superRefine(refineLeadContact);
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;

/**
 * The public form answer: an opaque id, never the lead's data or version. It is not the stored
 * lead's id when the enquiry was a repeat or a honeypot hit, so it reveals nothing.
 */
export const captureLeadResponseSchema = z.object({ id: z.uuid() });
export type CaptureLeadResponse = z.infer<typeof captureLeadResponseSchema>;

export const leadSchema = z.object({
  id: z.uuid(),
  status: leadStatusSchema,
  source: leadSourceSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  licenceClass: licenceClassSchema,
  message: z.string().nullable(),
  isMinor: z.boolean(),
  guardianName: z.string().nullable(),
  guardianContact: z.string().nullable(),
  consentTextVersion: z.string(),
  consentedAt: dateTimeSchema,
  /** Every enquiry, oldest first (the first one also fills `message`). */
  enquiries: z.array(leadEnquirySchema),
  /** Staff-only notes; enquiries never write here. */
  note: z.string().nullable(),
  studentId: z.uuid().nullable(),
  convertedAt: dateTimeSchema.nullable(),
  lostAt: dateTimeSchema.nullable(),
  lostReason: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type Lead = z.infer<typeof leadSchema>;

export const listLeadsQuerySchema = pageQuerySchema.extend({
  status: leadStatusSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const leadListResponseSchema = pageResponseSchema(leadSchema);
export type LeadListResponse = z.infer<typeof leadListResponseSchema>;

export const updateLeadRequestSchema = z
  .strictObject({
    status: leadStatusSchema.extract(['contacted', 'lost']).optional(),
    note: z.string().trim().max(LEAD_NOTE_MAX).optional(),
    lostReason: z.string().trim().min(1).max(LEAD_LOST_REASON_MAX).optional(),
    /** The version the client loaded; a mismatch → `409 version_conflict`. */
    version: z.number().int().positive().optional(),
  })
  .refine(({ version: _version, ...fields }) => hasSomeField(fields), {
    message: NO_FIELDS_MESSAGE,
  })
  .refine((body) => body.lostReason === undefined || body.status === 'lost', {
    message: 'Only with status lost',
    path: ['lostReason'],
  });
export type UpdateLeadRequest = z.infer<typeof updateLeadRequestSchema>;

export const convertLeadRequestSchema = createStudentRequestSchema
  .omit({ fullName: true, licenceClass: true })
  .extend({
    invite: z.boolean().default(true),
    inviteParent: z.boolean().default(false),
  });
export type ConvertLeadRequest = z.infer<typeof convertLeadRequestSchema>;

export const convertLeadResponseSchema = commandResultSchema.extend({
  studentId: z.uuid(),
  invitationId: z.uuid().nullable(),
  parentInvitationId: z.uuid().nullable(),
});
export type ConvertLeadResponse = z.infer<typeof convertLeadResponseSchema>;
