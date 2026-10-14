import { z } from 'zod';
import {
  countryCodeSchema,
  currencySchema,
  dateTimeSchema,
  latitudeSchema,
  licenceClassSchema,
  localeSchema,
  longitudeSchema,
  timeZoneSchema,
} from '../dto/common.js';
import {
  paymentAccountStatusSchema,
  recordChangeSchema,
  reviewStatusSchema,
  schoolStatusSchema,
  transmissionSchema,
} from '../dto/enums.js';
import { schoolSettingsSchema } from '../dto/school.js';
import { defineEvent } from './define-event.js';

export const SchoolCreated = defineEvent({
  type: 'SchoolCreated',
  version: 1,
  schema: z.object({
    schoolId: z.uuid(),
    name: z.string().min(1),
    legalName: z.string().min(1),
    countryCode: countryCodeSchema,
    timeZone: timeZoneSchema,
    currency: currencySchema,
    locale: localeSchema,
    status: schoolStatusSchema,
    planId: z.uuid(),
  }),
});

export const SchoolSettingsChanged = defineEvent({
  type: 'SchoolSettingsChanged',
  version: 1,
  schema: z.object({
    schoolId: z.uuid(),
    changedFields: z.array(z.string().min(1)).min(1),
    timeZone: timeZoneSchema,
    currency: currencySchema,
    locale: localeSchema,
    settings: schoolSettingsSchema,
  }),
});

export const BranchChanged = defineEvent({
  type: 'BranchChanged',
  version: 1,
  schema: z.object({
    branchId: z.uuid(),
    change: recordChangeSchema,
    name: z.string().min(1),
    address: z.string().min(1),
    lat: latitudeSchema,
    lng: longitudeSchema,
  }),
});

export const VehicleChanged = defineEvent({
  type: 'VehicleChanged',
  version: 1,
  schema: z.object({
    vehicleId: z.uuid(),
    change: recordChangeSchema,
    branchId: z.uuid(),
    plate: z.string().min(1),
    makeModel: z.string().min(1),
    transmission: transmissionSchema,
    licenceClass: licenceClassSchema,
    active: z.boolean(),
  }),
});

export const PaymentAccountConnected = defineEvent({
  type: 'PaymentAccountConnected',
  version: 1,
  schema: z.object({
    accountId: z.uuid(),
    provider: z.string().min(1),
    accountRef: z.string().min(1),
    status: paymentAccountStatusSchema,
  }),
});

export const ReviewSubmitted = defineEvent({
  type: 'ReviewSubmitted',
  version: 1,
  schema: z.object({
    reviewId: z.uuid(),
    studentId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    submittedAt: dateTimeSchema,
  }),
});

export const ReviewModerated = defineEvent({
  type: 'ReviewModerated',
  version: 1,
  schema: z.object({
    reviewId: z.uuid(),
    status: reviewStatusSchema.extract(['approved', 'hidden']),
    moderatedAt: dateTimeSchema,
  }),
});
