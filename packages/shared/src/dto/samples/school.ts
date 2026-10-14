import type {
  Branch,
  BranchListResponse,
  ConnectPaymentAccountRequest,
  ConnectPaymentAccountResponse,
  CreateBranchRequest,
  CreateVehicleRequest,
  ListBranchesQuery,
  ListReviewsQuery,
  ListStaffQuery,
  ListVehiclesQuery,
  ModerateReviewRequest,
  OpeningHoursEntry,
  OpeningHoursResponse,
  PaymentAccount,
  PublicProfile,
  PublicSchoolPage,
  PublicSlugParams,
  ReplaceOpeningHoursRequest,
  Review,
  ReviewListResponse,
  SchoolResponse,
  SchoolSettings,
  StaffListResponse,
  StaffMember,
  SubmitReviewRequest,
  UpdateBranchRequest,
  UpdatePublicProfileRequest,
  UpdateSchoolRequest,
  UpdateSchoolSettingsRequest,
  UpdateVehicleRequest,
  Vehicle,
  VehicleListResponse,
} from '../school.js';
import { SAMPLE_IDS as ids } from './fixtures.js';

const paymentAccount = {
  id: ids.paymentAccount,
  provider: 'fake',
  status: 'active',
} satisfies PaymentAccount;

const settings = {
  cancellationWindowHours: 24,
  allowNegativeBalance: false,
  minGapMinutes: 0,
  ageOfMajority: 18,
  quietHoursStart: '21:00',
  quietHoursEnd: '08:00',
  slotOfferTtlMinutes: 120,
  theoryPremiumFree: false,
  chatRetentionMonths: 24,
} satisfies SchoolSettings;

const openingHoursEntry = {
  id: ids.openingHours,
  branchId: null,
  weekday: 1,
  opens: '08:00',
  closes: '20:00',
} satisfies OpeningHoursEntry;

const branch = {
  id: ids.branch,
  name: 'Mitte',
  address: 'Unter den Linden 1, 10117 Berlin',
  lat: 52.517,
  lng: 13.389,
} satisfies Branch;

const vehicle = {
  id: ids.vehicle,
  branchId: ids.branch,
  plate: 'B-DS 101',
  makeModel: 'Volkswagen Golf',
  transmission: 'manual',
  licenceClass: 'B',
  active: true,
} satisfies Vehicle;

const staffMember = {
  membershipId: ids.instructorMembership,
  userId: ids.instructorUser,
  fullName: 'Ingo Instructor',
  phone: '+4915550000004',
  email: 'ingo.instructor@example.com',
  roles: ['instructor'],
  status: 'active',
} satisfies StaffMember;

const publicProfile = {
  slug: 'fahrschule-spree',
  published: true,
  headline: 'Learn to drive in Berlin Mitte',
  description: 'Manual and automatic lessons six days a week.',
  phone: '+4930555000100',
  whatsappNumber: '+4915550000002',
  instagramUrl: 'https://instagram.com/fahrschule.spree',
  facebookUrl: null,
  externalReviewUrl: 'https://maps.google.com/?cid=1234567890',
  showPrices: true,
  showInstructors: true,
  version: 3,
} satisfies PublicProfile;

const review = {
  id: ids.review,
  studentId: ids.student,
  displayName: 'Stella S.',
  rating: 5,
  text: 'Patient instructors and easy booking.',
  status: 'approved',
  submittedAt: '2026-10-02T15:00:00.000Z',
  moderatedAt: '2026-10-03T08:00:00.000Z',
} satisfies Review;

export const schoolSamples = {
  paymentAccount,
  schoolResponse: {
    id: ids.school,
    name: 'Fahrschule Spree',
    legalName: 'Fahrschule Spree GmbH',
    taxId: 'DE000000001',
    address: 'Unter den Linden 1, 10117 Berlin',
    countryCode: 'DE',
    timeZone: 'Europe/Berlin',
    currency: 'EUR',
    locale: 'en',
    status: 'active',
    paymentAccount,
  } satisfies SchoolResponse,
  updateSchoolRequest: {
    name: 'Fahrschule Spree Mitte',
    taxId: null,
  } satisfies UpdateSchoolRequest,
  schoolSettings: settings,
  updateSchoolSettingsRequest: {
    cancellationWindowHours: 48,
    quietHoursStart: '22:00',
  } satisfies UpdateSchoolSettingsRequest,
  openingHoursEntry,
  openingHoursResponse: {
    items: [
      openingHoursEntry,
      {
        ...openingHoursEntry,
        id: '0192f000-000f-7000-8000-000000000006',
        weekday: 6,
        opens: '09:00',
        closes: '14:00',
      },
    ],
  } satisfies OpeningHoursResponse,
  replaceOpeningHoursRequest: {
    items: [
      { branchId: null, weekday: 1, opens: '08:00', closes: '20:00' },
      { branchId: ids.branch, weekday: 6, opens: '09:00', closes: '14:00' },
    ],
  } satisfies ReplaceOpeningHoursRequest,
  branch,
  listBranchesQuery: { limit: 50 } satisfies ListBranchesQuery,
  branchListResponse: { items: [branch], nextCursor: null } satisfies BranchListResponse,
  createBranchRequest: {
    name: 'Kreuzberg',
    address: 'Oranienstraße 1, 10999 Berlin',
    lat: 52.502,
    lng: 13.418,
  } satisfies CreateBranchRequest,
  updateBranchRequest: { name: 'Mitte (Hauptstelle)' } satisfies UpdateBranchRequest,
  vehicle,
  listVehiclesQuery: {
    branchId: ids.branch,
    active: 'true',
    limit: 50,
  } satisfies ListVehiclesQuery,
  vehicleListResponse: {
    items: [
      vehicle,
      {
        ...vehicle,
        id: ids.vehicleAutomatic,
        plate: 'B-DS 102',
        makeModel: 'Volkswagen ID.3',
        transmission: 'automatic',
      },
    ],
    nextCursor: 'eyJwbGF0ZSI6IkItRFMgMTAyIn0',
  } satisfies VehicleListResponse,
  createVehicleRequest: {
    branchId: ids.branch,
    plate: 'B-DS 103',
    makeModel: 'Volkswagen Polo',
    transmission: 'manual',
    licenceClass: 'B',
    active: true,
  } satisfies CreateVehicleRequest,
  updateVehicleRequest: { active: false } satisfies UpdateVehicleRequest,
  staffMember,
  listStaffQuery: { role: 'instructor', limit: 50 } satisfies ListStaffQuery,
  staffListResponse: {
    items: [
      {
        membershipId: ids.ownerMembership,
        userId: ids.ownerUser,
        fullName: 'Otto Owner',
        phone: '+4915550000002',
        email: 'otto.owner@example.com',
        roles: ['owner'],
        status: 'active',
      },
      staffMember,
    ],
    nextCursor: null,
  } satisfies StaffListResponse,
  publicProfile,
  updatePublicProfileRequest: {
    slug: 'fahrschule-spree',
    published: true,
    whatsappNumber: '+4915550000002',
  } satisfies UpdatePublicProfileRequest,
  publicSlugParams: { slug: 'fahrschule-spree' } satisfies PublicSlugParams,
  publicSchoolPage: {
    slug: 'fahrschule-spree',
    name: 'Fahrschule Spree',
    headline: publicProfile.headline,
    description: publicProfile.description,
    address: 'Unter den Linden 1, 10117 Berlin',
    phone: '+4930555000100',
    whatsappUrl: 'https://wa.me/4915550000002',
    instagramUrl: 'https://instagram.com/fahrschule.spree',
    facebookUrl: null,
    externalReviewUrl: 'https://maps.google.com/?cid=1234567890',
    timeZone: 'Europe/Berlin',
    currency: 'EUR',
    locale: 'en',
    branches: [
      {
        ...branch,
        openingHours: [
          { weekday: 1, opens: '08:00', closes: '20:00' },
          { weekday: 6, opens: '09:00', closes: '14:00' },
        ],
      },
    ],
    prices: [
      {
        id: ids.packagePriceItem,
        name: '10 lessons',
        kind: 'package',
        amountMinor: 60000,
        currency: 'EUR',
        creditMinutes: 600,
      },
    ],
    instructors: [{ name: 'Ingo Instructor' }],
    reviews: {
      count: 1,
      averageRatingTenths: 50,
      items: [
        {
          id: review.id,
          displayName: review.displayName,
          rating: review.rating,
          text: review.text,
          submittedAt: review.submittedAt,
        },
      ],
    },
    licenceClasses: ['B'],
    consentTextVersion: 'lead-consent.v1',
  } satisfies PublicSchoolPage,
  review,
  submitReviewRequest: {
    rating: 5,
    text: 'Patient instructors and easy booking.',
  } satisfies SubmitReviewRequest,
  listReviewsQuery: { status: 'pending', limit: 50 } satisfies ListReviewsQuery,
  reviewListResponse: { items: [review], nextCursor: null } satisfies ReviewListResponse,
  moderateReviewRequest: { status: 'approved' } satisfies ModerateReviewRequest,
  connectPaymentAccountRequest: {
    provider: 'fake',
    returnUrl: 'http://localhost:5173/settings/payments',
  } satisfies ConnectPaymentAccountRequest,
  connectPaymentAccountResponse: {
    id: ids.paymentAccount,
    version: 1,
    provider: 'fake',
    status: 'pending',
    onboardingUrl: 'http://localhost:3000/v1/fake-payments/onboarding/acct_fake_spree',
  } satisfies ConnectPaymentAccountResponse,
};
