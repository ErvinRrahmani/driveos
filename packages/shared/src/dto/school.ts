import { z } from 'zod';
import {
  amountMinorSchema,
  countryCodeSchema,
  currencySchema,
  dateTimeSchema,
  hasSomeField,
  latitudeSchema,
  licenceClassSchema,
  localeSchema,
  localTimeSchema,
  longitudeSchema,
  NO_FIELDS_MESSAGE,
  minutesSchema,
  pageQuerySchema,
  pageResponseSchema,
  phoneSchema,
  booleanQuerySchema,
  timeZoneSchema,
  weekdaySchema,
} from './common.js';
import {
  paymentAccountStatusSchema,
  priceItemKindSchema,
  reviewStatusSchema,
  schoolStatusSchema,
  transmissionSchema,
} from './enums.js';
import { membershipRoleSchema, membershipStatusSchema } from './identity.js';

export const paymentAccountSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  status: paymentAccountStatusSchema,
});
export type PaymentAccount = z.infer<typeof paymentAccountSchema>;

export const schoolResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  legalName: z.string(),
  taxId: z.string().nullable(),
  address: z.string(),
  countryCode: countryCodeSchema,
  timeZone: timeZoneSchema,
  currency: currencySchema,
  locale: localeSchema,
  status: schoolStatusSchema,
  paymentAccount: paymentAccountSchema.nullable(),
});
export type SchoolResponse = z.infer<typeof schoolResponseSchema>;

export const updateSchoolRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    legalName: z.string().trim().min(1).max(200).optional(),
    taxId: z.string().trim().min(1).max(50).nullable().optional(),
    address: z.string().trim().min(1).max(500).optional(),
    timeZone: timeZoneSchema.optional(),
    locale: localeSchema.optional(),
  })
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdateSchoolRequest = z.infer<typeof updateSchoolRequestSchema>;

const settingsFields = {
  cancellationWindowHours: z.number().int().min(0).max(168),
  allowNegativeBalance: z.boolean(),
  minGapMinutes: z.number().int().min(0).max(240),
  ageOfMajority: z.number().int().min(14).max(21),
  quietHoursStart: localTimeSchema,
  quietHoursEnd: localTimeSchema,
  slotOfferTtlMinutes: z.number().int().min(5).max(1440),
  theoryPremiumFree: z.boolean(),
  chatRetentionMonths: z.number().int().min(1).max(120),
};

export const schoolSettingsSchema = z.object(settingsFields);
export type SchoolSettings = z.infer<typeof schoolSettingsSchema>;

export const updateSchoolSettingsRequestSchema = z
  .strictObject(settingsFields)
  .partial()
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdateSchoolSettingsRequest = z.infer<typeof updateSchoolSettingsRequestSchema>;

const openingHoursFields = {
  branchId: z.uuid().nullable(),
  weekday: weekdaySchema,
  opens: localTimeSchema,
  closes: localTimeSchema,
};

const opensBeforeCloses = (row: { opens: string; closes: string }) => row.opens < row.closes;
const OPENS_BEFORE_CLOSES = { message: 'opens must be before closes', path: ['closes'] };

export const openingHoursEntrySchema = z.object({ id: z.uuid(), ...openingHoursFields });
export type OpeningHoursEntry = z.infer<typeof openingHoursEntrySchema>;

export const openingHoursResponseSchema = z.object({ items: z.array(openingHoursEntrySchema) });
export type OpeningHoursResponse = z.infer<typeof openingHoursResponseSchema>;

export const replaceOpeningHoursRequestSchema = z.strictObject({
  items: z
    .array(z.strictObject(openingHoursFields).refine(opensBeforeCloses, OPENS_BEFORE_CLOSES))
    .max(100),
});
export type ReplaceOpeningHoursRequest = z.infer<typeof replaceOpeningHoursRequestSchema>;

const branchFields = {
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  lat: latitudeSchema,
  lng: longitudeSchema,
};

export const branchSchema = z.object({ id: z.uuid(), ...branchFields });
export type Branch = z.infer<typeof branchSchema>;

export const listBranchesQuerySchema = pageQuerySchema;
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;

export const branchListResponseSchema = pageResponseSchema(branchSchema);
export type BranchListResponse = z.infer<typeof branchListResponseSchema>;

export const createBranchRequestSchema = z.strictObject(branchFields);
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;

export const updateBranchRequestSchema = z
  .strictObject(branchFields)
  .partial()
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;

const vehicleFields = {
  branchId: z.uuid(),
  plate: z.string().trim().min(1).max(20),
  makeModel: z.string().trim().min(1).max(100),
  transmission: transmissionSchema,
  licenceClass: licenceClassSchema,
};

export const vehicleSchema = z.object({ id: z.uuid(), ...vehicleFields, active: z.boolean() });
export type Vehicle = z.infer<typeof vehicleSchema>;

export const listVehiclesQuerySchema = pageQuerySchema.extend({
  branchId: z.uuid().optional(),
  active: booleanQuerySchema.optional(),
});
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;

export const vehicleListResponseSchema = pageResponseSchema(vehicleSchema);
export type VehicleListResponse = z.infer<typeof vehicleListResponseSchema>;

export const createVehicleRequestSchema = z.strictObject({
  ...vehicleFields,
  active: z.boolean().default(true),
});
export type CreateVehicleRequest = z.infer<typeof createVehicleRequestSchema>;

export const updateVehicleRequestSchema = z
  .strictObject({ ...vehicleFields, active: z.boolean() })
  .partial()
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdateVehicleRequest = z.infer<typeof updateVehicleRequestSchema>;

export const staffMemberSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  roles: z.array(membershipRoleSchema),
  status: membershipStatusSchema,
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

export const listStaffQuerySchema = pageQuerySchema.extend({
  role: membershipRoleSchema.extract(['owner', 'office', 'instructor']).optional(),
});
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;

export const staffListResponseSchema = pageResponseSchema(staffMemberSchema);
export type StaffListResponse = z.infer<typeof staffListResponseSchema>;

export const connectPaymentAccountRequestSchema = z.strictObject({
  provider: z.string().trim().min(1).max(50),
  returnUrl: z.url().optional(),
});
export type ConnectPaymentAccountRequest = z.infer<typeof connectPaymentAccountRequestSchema>;

export const connectPaymentAccountResponseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  provider: z.string(),
  status: paymentAccountStatusSchema,
  onboardingUrl: z.url().nullable(),
});
export type ConnectPaymentAccountResponse = z.infer<typeof connectPaymentAccountResponseSchema>;

const httpsUrl = (max: number) => z.url({ protocol: /^https$/ }).max(max);

const publicProfileFields = {
  slug: z.string().trim().min(3).max(40),
  published: z.boolean(),
  headline: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(2000).nullable(),
  phone: phoneSchema.nullable(),
  whatsappNumber: phoneSchema.nullable(),
  instagramUrl: httpsUrl(300).nullable(),
  facebookUrl: httpsUrl(300).nullable(),
  externalReviewUrl: httpsUrl(500).nullable(),
  showPrices: z.boolean(),
  showInstructors: z.boolean(),
};

export const publicProfileSchema = z.object({
  ...publicProfileFields,
  version: z.number().int().positive(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const updatePublicProfileRequestSchema = z
  .strictObject(publicProfileFields)
  .partial()
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdatePublicProfileRequest = z.infer<typeof updatePublicProfileRequestSchema>;

const ratingSchema = z.number().int().min(1).max(5);

/** Version of the consent text the public enrolment form shows (i18n `publicPage.consent.v1`). */
export const LEAD_CONSENT_TEXT_VERSION = 'lead-consent.v1';

export const publicSchoolPageSchema = z.object({
  slug: z.string(),
  name: z.string(),
  headline: z.string().nullable(),
  description: z.string().nullable(),
  address: z.string(),
  phone: z.string().nullable(),
  whatsappUrl: z.url().nullable(),
  instagramUrl: z.url().nullable(),
  facebookUrl: z.url().nullable(),
  externalReviewUrl: z.url().nullable(),
  timeZone: timeZoneSchema,
  currency: currencySchema,
  locale: localeSchema,
  branches: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      address: z.string(),
      lat: latitudeSchema,
      lng: longitudeSchema,
      openingHours: z.array(
        z.object({ weekday: weekdaySchema, opens: localTimeSchema, closes: localTimeSchema }),
      ),
    }),
  ),
  prices: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: priceItemKindSchema,
      amountMinor: amountMinorSchema,
      currency: currencySchema,
      creditMinutes: minutesSchema.nullable(),
    }),
  ),
  instructors: z.array(z.object({ membershipId: z.uuid(), name: z.string() })),
  reviews: z.object({
    count: z.number().int().nonnegative(),
    averageRatingTenths: z.number().int().min(0).max(50),
    items: z.array(
      z.object({
        id: z.uuid(),
        displayName: z.string(),
        rating: ratingSchema,
        text: z.string().nullable(),
        submittedAt: dateTimeSchema,
      }),
    ),
  }),
  licenceClasses: z.array(licenceClassSchema),
  consentTextVersion: z.string(),
});
export type PublicSchoolPage = z.infer<typeof publicSchoolPageSchema>;

export const publicSlugParamsSchema = z.object({ slug: z.string().trim().min(3).max(40) });
export type PublicSlugParams = z.infer<typeof publicSlugParamsSchema>;

export const reviewSchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  displayName: z.string(),
  rating: ratingSchema,
  text: z.string().nullable(),
  status: reviewStatusSchema,
  submittedAt: dateTimeSchema,
  moderatedAt: dateTimeSchema.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;

export const submitReviewRequestSchema = z.strictObject({
  rating: ratingSchema,
  text: z.string().trim().max(600).optional(),
});
export type SubmitReviewRequest = z.infer<typeof submitReviewRequestSchema>;

export const listReviewsQuerySchema = pageQuerySchema.extend({
  status: reviewStatusSchema.optional(),
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

export const reviewListResponseSchema = pageResponseSchema(reviewSchema);
export type ReviewListResponse = z.infer<typeof reviewListResponseSchema>;

export const moderateReviewRequestSchema = z.strictObject({
  status: reviewStatusSchema.extract(['approved', 'hidden']),
});
export type ModerateReviewRequest = z.infer<typeof moderateReviewRequestSchema>;
