import { z } from 'zod';
import {
  amountMinorSchema,
  booleanQuerySchema,
  commandResultSchema,
  countryCodeSchema,
  currencySchema,
  dateTimeSchema,
  hasSomeField,
  licenceClassSchema,
  localeSchema,
  monthSchema,
  NO_FIELDS_MESSAGE,
  pageQuerySchema,
  pageResponseSchema,
  timeZoneSchema,
} from './common.js';
import {
  platformStatementStatusSchema,
  schoolStatusSchema,
  statementPaidMethodSchema,
} from './enums.js';

export const SUPPORT_SESSION_MAX_MINUTES = 60;

export const createSchoolRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(200),
  taxId: z.string().trim().min(1).max(50).optional(),
  address: z.string().trim().min(1).max(500),
  countryCode: countryCodeSchema,
  timeZone: timeZoneSchema,
  currency: currencySchema,
  locale: localeSchema,
  status: schoolStatusSchema.extract(['onboarding', 'active']).default('active'),
  planId: z.uuid(),
  owner: z
    .strictObject({
      fullName: z.string().trim().min(1).max(200),
      phone: z.string().trim().min(3).max(32).optional(),
      email: z.string().trim().min(3).max(254).optional(),
    })
    .refine((owner) => owner.phone !== undefined || owner.email !== undefined, {
      message: 'Give a phone or an email',
      path: ['phone'],
    }),
});
export type CreateSchoolRequest = z.infer<typeof createSchoolRequestSchema>;

export const createSchoolResponseSchema = commandResultSchema.extend({
  schoolId: z.uuid(),
  invitationId: z.uuid(),
  acceptToken: z.string().optional(),
});
export type CreateSchoolResponse = z.infer<typeof createSchoolResponseSchema>;

const nonNegativeMinor = amountMinorSchema.nonnegative();

export const PLAN_FEATURES = ['enrolment_page'] as const;
const planFeatureSchema = z.enum(PLAN_FEATURES);
export type PlanFeature = z.infer<typeof planFeatureSchema>;

const planFeaturesSchema = z.array(planFeatureSchema).max(20);

const planFields = {
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{1,40}$/),
  name: z.string().trim().min(1).max(100),
  baseAmountMinor: nonNegativeMinor,
  studentFeeMinor: nonNegativeMinor,
  currency: currencySchema,
  maxInstructorSeats: z.number().int().positive().nullable(),
  features: planFeaturesSchema.default([]),
};

export const planSchema = z.object({ id: z.uuid(), ...planFields, active: z.boolean() });
export type Plan = z.infer<typeof planSchema>;

export const listPlansQuerySchema = pageQuerySchema.extend({
  active: booleanQuerySchema.optional(),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;

export const planListResponseSchema = pageResponseSchema(planSchema);
export type PlanListResponse = z.infer<typeof planListResponseSchema>;

export const createPlanRequestSchema = z.strictObject({
  ...planFields,
  active: z.boolean().default(true),
});
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export const updatePlanRequestSchema = z
  .strictObject({
    name: planFields.name,
    baseAmountMinor: planFields.baseAmountMinor,
    studentFeeMinor: planFields.studentFeeMinor,
    maxInstructorSeats: planFields.maxInstructorSeats,
    features: planFeaturesSchema,
    active: z.boolean(),
  })
  .partial()
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;

export const platformStatementSchema = z.object({
  id: z.uuid(),
  schoolId: z.uuid(),
  schoolName: z.string(),
  month: monthSchema,
  totalMinor: amountMinorSchema,
  currency: currencySchema,
  status: platformStatementStatusSchema,
  issuedAt: dateTimeSchema,
  paidAt: dateTimeSchema.nullable(),
  paidMethod: statementPaidMethodSchema.nullable(),
  paidReference: z.string().nullable(),
  markedPaidByUserId: z.uuid().nullable(),
});
export type PlatformStatement = z.infer<typeof platformStatementSchema>;

export const listPlatformStatementsQuerySchema = pageQuerySchema.extend({
  schoolId: z.uuid().optional(),
  status: platformStatementStatusSchema.optional(),
  month: monthSchema.optional(),
});
export type ListPlatformStatementsQuery = z.infer<typeof listPlatformStatementsQuerySchema>;

export const platformStatementListResponseSchema = pageResponseSchema(platformStatementSchema);
export type PlatformStatementListResponse = z.infer<typeof platformStatementListResponseSchema>;

export const markStatementPaidRequestSchema = z
  .strictObject({
    method: statementPaidMethodSchema,
    paidAt: dateTimeSchema,
    reference: z.string().trim().min(1).max(100).optional(),
  })
  .refine((body) => body.method !== 'bank_transfer' || body.reference !== undefined, {
    message: 'A bank transfer needs a reference',
    path: ['reference'],
  });
export type MarkStatementPaidRequest = z.infer<typeof markStatementPaidRequestSchema>;

const examRulesBase = {
  questions: z.number().int().positive(),
  timeLimitMinutes: z.number().int().positive(),
  categories: z.record(z.string(), z.number().int().nonnegative()).optional(),
};

export const examRulesSchema = z.discriminatedUnion('rules', [
  z.strictObject({
    rules: z.literal('fraction'),
    passMark: z.number().gt(0).lte(1),
    ...examRulesBase,
  }),
  z.strictObject({
    rules: z.literal('error_points'),
    maxErrorPoints: z.number().int().nonnegative(),
    ...examRulesBase,
  }),
]);
export type ExamRules = z.infer<typeof examRulesSchema>;

export const questionPackQuestionSchema = z.strictObject({
  ref: z.string().min(1),
  category: z.string().min(1),
  body: z.string().min(1),
  media: z.string().nullable(),
  answers: z.array(z.string().min(1)).min(2),
  correct: z.array(z.number().int().nonnegative()).min(1),
  points: z.number().int().positive(),
  explanation: z.string(),
  instantFail: z.boolean().optional(),
});
export type QuestionPackQuestion = z.infer<typeof questionPackQuestionSchema>;

export const importQuestionPackRequestSchema = z.strictObject({
  country: countryCodeSchema,
  licenceClass: licenceClassSchema,
  language: localeSchema,
  version: z.string().regex(/^\d{4}\.\d{1,2}$/),
  exam: examRulesSchema,
  questions: z.array(questionPackQuestionSchema).min(1),
});
export type ImportQuestionPackRequest = z.infer<typeof importQuestionPackRequestSchema>;

export const importQuestionPackResponseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  questionCount: z.number().int().positive(),
});
export type ImportQuestionPackResponse = z.infer<typeof importQuestionPackResponseSchema>;

export const startSupportSessionRequestSchema = z.strictObject({
  schoolId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(SUPPORT_SESSION_MAX_MINUTES)
    .default(SUPPORT_SESSION_MAX_MINUTES),
});
export type StartSupportSessionRequest = z.infer<typeof startSupportSessionRequestSchema>;

export const startSupportSessionResponseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  supportToken: z.string(),
  expiresAt: dateTimeSchema,
});
export type StartSupportSessionResponse = z.infer<typeof startSupportSessionResponseSchema>;

export const auditLogEntrySchema = z.object({
  id: z.uuid(),
  schoolId: z.uuid().nullable(),
  actorUserId: z.uuid(),
  actorName: z.string().nullable(),
  supportSessionId: z.uuid().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.uuid(),
  reason: z.string().nullable(),
  at: dateTimeSchema,
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const listAuditLogQuerySchema = pageQuerySchema.extend({
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  action: z.string().min(1).max(100).optional(),
  supportSessionId: z.uuid().optional(),
});
export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;

export const auditLogListResponseSchema = pageResponseSchema(auditLogEntrySchema);
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;

export const platformAlertNameSchema = z.enum([
  'dead_letters',
  'outbox_lag',
  'webhook_failures',
  'sync_backlog',
]);
export type PlatformAlertName = z.infer<typeof platformAlertNameSchema>;

export const platformAlertSchema = z.object({
  alert: platformAlertNameSchema,
  value: z.number(),
  threshold: z.number(),
  schoolId: z.uuid().nullable(),
  since: dateTimeSchema,
});
export type PlatformAlert = z.infer<typeof platformAlertSchema>;

export const platformAlertListResponseSchema = z.object({
  items: z.array(platformAlertSchema),
  evaluatedAt: dateTimeSchema.nullable(),
});
export type PlatformAlertListResponse = z.infer<typeof platformAlertListResponseSchema>;
