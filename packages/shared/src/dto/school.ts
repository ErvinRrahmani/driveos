import { z } from 'zod';
import {
  countryCodeSchema,
  currencySchema,
  hasSomeField,
  latitudeSchema,
  licenceClassSchema,
  localeSchema,
  localTimeSchema,
  longitudeSchema,
  NO_FIELDS_MESSAGE,
  pageQuerySchema,
  pageResponseSchema,
  booleanQuerySchema,
  timeZoneSchema,
  weekdaySchema,
} from './common.js';
import { paymentAccountStatusSchema, schoolStatusSchema, transmissionSchema } from './enums.js';
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
