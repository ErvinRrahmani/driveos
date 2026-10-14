import { LEAD_CONSENT_TEXT_VERSION } from '@driveos/shared';
import type { priceItems } from '../../src/modules/billing/infra/schema.js';
import type { users } from '../../src/modules/identity/infra/schema.js';
import type { plans } from '../../src/modules/platform/infra/schema.js';
import type { lessonTypes } from '../../src/modules/scheduling/infra/schema.js';
import type {
  branches,
  schoolPublicProfiles,
  schoolReviews,
  schools,
  vehicles,
} from '../../src/modules/school/infra/schema.js';
import type {
  growthReports,
  rmSchoolMetricsDaily,
} from '../../src/modules/reporting/infra/schema.js';
import { MANUAL_LEAD_CONSENT_VERSION } from '../../src/modules/training/domain/leads.js';
import type { leads, students } from '../../src/modules/training/infra/schema.js';

const ENTITY = {
  school: 0x01,
  user: 0x02,
  membership: 0x03,
  branch: 0x04,
  vehicle: 0x05,
  lessonType: 0x06,
  student: 0x07,
  enrolment: 0x08,
  studentInstructor: 0x09,
  guardianLink: 0x0a,
  syllabusItem: 0x0b,
  priceItem: 0x0c,
  plan: 0x0d,
  subscription: 0x0e,
  openingHours: 0x0f,
  questionPack: 0x10,
  question: 0x11,
  availability: 0x12,
  conversation: 0x13,
  message: 0x14,
  lead: 0x15,
  review: 0x16,
  testAttempt: 0x17,
  growthReport: 0x18,
} as const;

export function seedId(entity: keyof typeof ENTITY, n: number): string {
  const kind = ENTITY[entity].toString(16).padStart(4, '0');
  return `0192f000-${kind}-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

export const SEED_AT = new Date('2026-09-01T08:00:00.000Z');
export const LICENCE_CLASS = 'B';
export const CURRENCY = 'EUR';

type UserRow = typeof users.$inferInsert & { id: string };
type Role = 'owner' | 'office' | 'instructor' | 'student' | 'parent';

const user = (n: number, fullName: string, phone: string, email: string): UserRow => ({
  id: seedId('user', n),
  fullName,
  phone,
  email,
  locale: 'en',
});

export const SEED = {
  schools: {
    berlin: {
      id: seedId('school', 1),
      name: 'Fahrschule Spree',
      legalName: 'Fahrschule Spree GmbH',
      taxId: 'DE000000001',
      address: 'Unter den Linden 1, 10117 Berlin',
      countryCode: 'DE',
      timeZone: 'Europe/Berlin',
      currency: CURRENCY,
      locale: 'en',
      status: 'active',
    },
    lisbon: {
      id: seedId('school', 2),
      name: 'Escola de Condução Tejo',
      legalName: 'Escola de Condução Tejo, Lda.',
      taxId: 'PT000000002',
      address: 'Rua Augusta 1, 1100-053 Lisboa',
      countryCode: 'PT',
      timeZone: 'Europe/Lisbon',
      currency: CURRENCY,
      locale: 'en',
      status: 'active',
    },
  } satisfies Record<string, typeof schools.$inferInsert>,
  users: {
    platformAdmin: user(1, 'Petra Platform', '+4915550000001', 'petra.platform@example.com'),
    berlinOwner: user(2, 'Otto Owner', '+4915550000002', 'otto.owner@example.com'),
    berlinOffice: user(3, 'Olga Office', '+4915550000003', 'olga.office@example.com'),
    berlinInstructor: user(4, 'Ingo Instructor', '+4915550000004', 'ingo.instructor@example.com'),
    lisbonOwner: user(5, 'Ines Ferreira', '+351910000005', 'ines.ferreira@example.com'),
    stella: user(6, 'Stella Student', '+4915550000006', 'stella.student@example.com'),
    sam: user(7, 'Sam Schulz', '+4915550000007', 'sam.schulz@example.com'),
    sofia: user(8, 'Sofia Silva', '+4915550000008', 'sofia.silva@example.com'),
    simon: user(9, 'Simon Sommer', '+4915550000009', 'simon.sommer@example.com'),
    mia: user(10, 'Mia Minor', '+4915550000010', 'mia.minor@example.com'),
    guardian: user(11, 'Gustav Minor', '+4915550000011', 'gustav.minor@example.com'),
  },
  memberships: {
    berlinOwner: seedId('membership', 1),
    berlinOffice: seedId('membership', 2),
    berlinInstructor: seedId('membership', 3),
    lisbonOwner: seedId('membership', 4),
    stella: seedId('membership', 5),
    sam: seedId('membership', 6),
    sofia: seedId('membership', 7),
    simon: seedId('membership', 8),
    mia: seedId('membership', 9),
    guardian: seedId('membership', 10),
  },
  students: {
    stella: { id: seedId('student', 1), dateOfBirth: '2003-04-12', area: 'Mitte' },
    sam: { id: seedId('student', 2), dateOfBirth: '2000-07-30', area: 'Kreuzberg' },
    sofia: { id: seedId('student', 3), dateOfBirth: '1997-11-05', area: 'Mitte' },
    simon: { id: seedId('student', 4), dateOfBirth: '2006-01-20', area: 'Prenzlauer Berg' },
    minor: { id: seedId('student', 5), dateOfBirth: null, area: 'Kreuzberg' },
  },
  plans: {
    solo: {
      id: seedId('plan', 1),
      code: 'solo',
      name: 'Solo',
      baseAmountMinor: 0,
      studentFeeMinor: 300,
      currency: CURRENCY,
      maxInstructorSeats: 1,
      features: [],
      active: true,
    },
    standard: {
      id: seedId('plan', 2),
      code: 'standard',
      name: 'Standard',
      baseAmountMinor: 4900,
      studentFeeMinor: 300,
      currency: CURRENCY,
      maxInstructorSeats: null,
      features: ['enrolment_page'],
      active: true,
    },
  } satisfies Record<string, typeof plans.$inferInsert>,
  questionPack: { id: seedId('questionPack', 1), file: 'sample-B-en.json' },
} as const;

type SchoolKey = keyof typeof SEED.schools;
type UserKey = keyof typeof SEED.users;
type StudentKey = keyof typeof SEED.students;

export interface MembershipSeed {
  id: string;
  school: SchoolKey;
  user: UserKey;
  roles: Role[];
  status: 'active' | 'pending_consent';
  label: string;
}

export const MEMBERSHIPS: MembershipSeed[] = [
  {
    id: SEED.memberships.berlinOwner,
    school: 'berlin',
    user: 'berlinOwner',
    roles: ['owner'],
    status: 'active',
    label: 'Owner',
  },
  {
    id: SEED.memberships.berlinOffice,
    school: 'berlin',
    user: 'berlinOffice',
    roles: ['office'],
    status: 'active',
    label: 'Office',
  },
  {
    id: SEED.memberships.berlinInstructor,
    school: 'berlin',
    user: 'berlinInstructor',
    roles: ['instructor'],
    status: 'active',
    label: 'Instructor',
  },
  {
    id: SEED.memberships.lisbonOwner,
    school: 'lisbon',
    user: 'lisbonOwner',
    roles: ['owner', 'instructor'],
    status: 'active',
    label: 'Owner + instructor',
  },
  {
    id: SEED.memberships.stella,
    school: 'berlin',
    user: 'stella',
    roles: ['student'],
    status: 'active',
    label: 'Student',
  },
  {
    id: SEED.memberships.sam,
    school: 'berlin',
    user: 'sam',
    roles: ['student'],
    status: 'active',
    label: 'Student',
  },
  {
    id: SEED.memberships.sofia,
    school: 'berlin',
    user: 'sofia',
    roles: ['student'],
    status: 'active',
    label: 'Student',
  },
  {
    id: SEED.memberships.simon,
    school: 'berlin',
    user: 'simon',
    roles: ['student'],
    status: 'active',
    label: 'Student',
  },
  {
    id: SEED.memberships.mia,
    school: 'berlin',
    user: 'mia',
    roles: ['student'],
    status: 'pending_consent',
    label: 'Student (minor, 16)',
  },
  {
    id: SEED.memberships.guardian,
    school: 'berlin',
    user: 'guardian',
    roles: ['parent'],
    status: 'active',
    label: 'Parent of Mia',
  },
];

export const STUDENT_USERS: Record<StudentKey, UserKey> = {
  stella: 'stella',
  sam: 'sam',
  sofia: 'sofia',
  simon: 'simon',
  minor: 'mia',
};

export interface SeedChatMessage {
  student: StudentKey;
  withInstructor: boolean;
  sender: UserKey;
  body: string;
  minutesAfterSeed: number;
}

export const CHAT_MESSAGES: SeedChatMessage[] = [
  {
    student: 'stella',
    withInstructor: false,
    sender: 'stella',
    body: 'Hi! Can I book two lessons next week?',
    minutesAfterSeed: 0,
  },
  {
    student: 'stella',
    withInstructor: false,
    sender: 'berlinOffice',
    body: 'Sure, Stella. Tuesday and Thursday at 17:00 are free.',
    minutesAfterSeed: 12,
  },
  {
    student: 'stella',
    withInstructor: true,
    sender: 'berlinInstructor',
    body: 'Great drive today. Next time we practise roundabouts.',
    minutesAfterSeed: 30,
  },
  {
    student: 'stella',
    withInstructor: true,
    sender: 'stella',
    body: 'Thanks! See you on Tuesday.',
    minutesAfterSeed: 45,
  },
];

export const SUBSCRIPTIONS: { id: string; school: SchoolKey; plan: keyof typeof SEED.plans }[] = [
  { id: seedId('subscription', 1), school: 'berlin', plan: 'standard' },
  { id: seedId('subscription', 2), school: 'lisbon', plan: 'solo' },
];

export const BRANCHES: Record<SchoolKey, typeof branches.$inferInsert & { id: string }> = {
  berlin: {
    id: seedId('branch', 1),
    schoolId: SEED.schools.berlin.id,
    name: 'Mitte',
    address: 'Unter den Linden 1, 10117 Berlin',
    lat: 52.5170365,
    lng: 13.3888599,
  },
  lisbon: {
    id: seedId('branch', 2),
    schoolId: SEED.schools.lisbon.id,
    name: 'Baixa',
    address: 'Rua Augusta 1, 1100-053 Lisboa',
    lat: 38.7086,
    lng: -9.1366,
  },
};

export const AVAILABILITY_FROM = '2026-09-01';

export const AVAILABILITY: { weekday: number; startTime: string; endTime: string }[] = [
  1, 2, 3, 4, 5,
].map((weekday) => ({ weekday, startTime: '09:00', endTime: '17:00' }));

export const OPENING_HOURS: { weekday: number; opens: string; closes: string }[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: '08:00', closes: '20:00' })),
  { weekday: 6, opens: '09:00', closes: '14:00' },
];

export const VEHICLES: (typeof vehicles.$inferInsert & { id: string })[] = [
  {
    id: seedId('vehicle', 1),
    schoolId: SEED.schools.berlin.id,
    branchId: BRANCHES.berlin.id,
    plate: 'B-DS 101',
    makeModel: 'Volkswagen Golf',
    transmission: 'manual',
    licenceClass: LICENCE_CLASS,
    active: true,
  },
  {
    id: seedId('vehicle', 2),
    schoolId: SEED.schools.berlin.id,
    branchId: BRANCHES.berlin.id,
    plate: 'B-DS 102',
    makeModel: 'Volkswagen ID.3',
    transmission: 'automatic',
    licenceClass: LICENCE_CLASS,
    active: true,
  },
  {
    id: seedId('vehicle', 3),
    schoolId: SEED.schools.lisbon.id,
    branchId: BRANCHES.lisbon.id,
    plate: 'AA-00-XX',
    makeModel: 'Renault Clio',
    transmission: 'manual',
    licenceClass: LICENCE_CLASS,
    active: true,
  },
];

type LessonTypeSeed = Omit<typeof lessonTypes.$inferInsert, 'id' | 'schoolId'>;

export const LESSON_TYPES: LessonTypeSeed[] = [
  {
    name: 'Standard lesson',
    kind: 'lesson',
    licenceClass: LICENCE_CLASS,
    minutes: 60,
    creditMinutes: 60,
    requiresVehicle: true,
    requiresEntitlement: null,
    active: true,
  },
  {
    name: 'Night drive',
    kind: 'lesson',
    licenceClass: LICENCE_CLASS,
    minutes: 45,
    creditMinutes: 60,
    requiresVehicle: true,
    requiresEntitlement: null,
    active: true,
  },
  {
    name: 'Driving exam',
    kind: 'exam',
    licenceClass: LICENCE_CLASS,
    minutes: 60,
    creditMinutes: 0,
    requiresVehicle: true,
    requiresEntitlement: 'exam_car',
    active: true,
  },
];

export const SYLLABUS_ITEMS: { code: string; title: string }[] = [
  { code: 'B01', title: 'Vehicle checks and controls' },
  { code: 'B02', title: 'Moving off and stopping' },
  { code: 'B03', title: 'Steering and gear changes' },
  { code: 'B04', title: 'Junctions and roundabouts' },
  { code: 'B05', title: 'Parking and manoeuvres' },
  { code: 'B06', title: 'Town and city driving' },
  { code: 'B07', title: 'Country roads and motorways' },
  { code: 'B08', title: 'Night driving and bad weather' },
];

type PriceItemSeed = Omit<typeof priceItems.$inferInsert, 'id' | 'schoolId'>;

const priceItemsOf = (
  taxRateBp: number,
  amounts: [number, number, number, number],
): PriceItemSeed[] => [
  {
    name: 'Single lesson',
    kind: 'lesson',
    creditMinutes: 60,
    entitlementKind: null,
    amountMinor: amounts[0],
    currency: CURRENCY,
    taxRateBp,
    active: true,
    sortOrder: 1,
  },
  {
    name: '10-lesson package',
    kind: 'package',
    creditMinutes: 600,
    entitlementKind: null,
    amountMinor: amounts[1],
    currency: CURRENCY,
    taxRateBp,
    active: true,
    sortOrder: 2,
  },
  {
    name: 'Premium theory',
    kind: 'upsell',
    creditMinutes: null,
    entitlementKind: 'premium_theory',
    amountMinor: amounts[2],
    currency: CURRENCY,
    taxRateBp,
    active: true,
    sortOrder: 3,
  },
  {
    name: 'Car for the exam',
    kind: 'upsell',
    creditMinutes: null,
    entitlementKind: 'exam_car',
    amountMinor: amounts[3],
    currency: CURRENCY,
    taxRateBp,
    active: true,
    sortOrder: 4,
  },
];

/** `publicCount` leading items (single lesson, 10-lesson package) are shown on the public page. */
const priceList = (
  taxRateBp: number,
  amounts: [number, number, number, number],
  publicCount = 0,
): PriceItemSeed[] =>
  priceItemsOf(taxRateBp, amounts).map((item, index) => ({
    ...item,
    showOnPublicPage: index < publicCount,
  }));

export const PRICE_LISTS: Record<SchoolKey, PriceItemSeed[]> = {
  berlin: priceList(1900, [6500, 60000, 2900, 15000], 2),
  lisbon: priceList(2300, [4500, 42000, 2500, 11000]),
};

export function minorDateOfBirth(today: Date): string {
  const date = new Date(
    Date.UTC(today.getUTCFullYear() - 16, today.getUTCMonth(), today.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() - 60);
  return date.toISOString().slice(0, 10);
}

export function studentRows(today: Date): (typeof students.$inferInsert & { id: string })[] {
  return (Object.keys(SEED.students) as StudentKey[]).map((key) => {
    const student = SEED.students[key];
    return {
      id: student.id,
      schoolId: SEED.schools.berlin.id,
      userId: SEED.users[STUDENT_USERS[key]].id,
      fullName: SEED.users[STUDENT_USERS[key]].fullName,
      dateOfBirth: student.dateOfBirth ?? minorDateOfBirth(today),
      licenceClass: LICENCE_CLASS,
      examLanguage: 'en',
      area: student.area,
      status: 'active',
    };
  });
}

/*
 * Enrolment page (premium `enrolment_page`, Standard plan): Fahrschule Spree only. Escola Tejo is on
 * Solo, which has no such feature, so it gets no profile, review or lead.
 */
type SeedRow<T extends { $inferInsert: object }> = Omit<T['$inferInsert'], 'schoolId'> & {
  id: string;
};

export const PUBLIC_PROFILE: Omit<typeof schoolPublicProfiles.$inferInsert, 'schoolId'> = {
  slug: 'fahrschule-spree',
  published: true,
  headline: 'Your driving licence in Berlin Mitte, step by step',
  description:
    'Fahrschule Spree teaches class B in Berlin Mitte: patient instructors, manual and automatic ' +
    'cars, evening lessons and theory you can practise in the app.',
  phone: '+4915550000002',
  whatsappNumber: '+4915550000002',
  instagramUrl: 'https://instagram.com/fahrschule.spree',
  facebookUrl: null,
  externalReviewUrl: 'https://maps.google.com/?cid=example',
  showPrices: true,
  showInstructors: true,
};

/** Sam passed the practical test; that is what lets him review the school. */
export const PASSED_PRACTICAL = {
  id: seedId('testAttempt', 1),
  student: 'sam',
  kind: 'practical',
  takenOn: '2026-09-15',
  result: 'passed',
  notes: 'Passed first time.',
} as const;

export const REVIEW: SeedRow<typeof schoolReviews> = {
  id: seedId('review', 1),
  studentId: SEED.students.sam.id,
  rating: 5,
  text: 'Patient instructors and clear explanations. I passed the practical test first time.',
  displayName: 'Sam S.',
  status: 'approved',
  submittedAt: new Date('2026-09-16T10:00:00.000Z'),
  moderatedAt: new Date('2026-09-17T09:00:00.000Z'),
  moderatedByUserId: SEED.users.berlinOwner.id,
  version: 2,
};

const LEA_CAPTURED_AT = new Date('2026-09-20T17:45:00.000Z');
const SOFIA_CAPTURED_AT = new Date('2026-09-01T07:30:00.000Z');

export const LEADS = {
  lea: {
    id: seedId('lead', 1),
    status: 'new',
    source: 'page',
    fullName: 'Lea Lead',
    phone: '+4915550000020',
    email: 'lea.lead@example.com',
    licenceClass: LICENCE_CLASS,
    message: 'Hi! I would like to start in October. Do you offer evening lessons?',
    isMinor: false,
    consentTextVersion: LEAD_CONSENT_TEXT_VERSION,
    consentedAt: LEA_CAPTURED_AT,
    createdAt: LEA_CAPTURED_AT,
  },
  sofia: {
    id: seedId('lead', 2),
    status: 'converted',
    source: 'manual',
    fullName: SEED.users.sofia.fullName,
    phone: SEED.users.sofia.phone,
    email: SEED.users.sofia.email,
    licenceClass: LICENCE_CLASS,
    message: null,
    isMinor: false,
    consentTextVersion: MANUAL_LEAD_CONSENT_VERSION,
    consentedAt: SOFIA_CAPTURED_AT,
    note: 'Phoned the office; enrolled the same morning.',
    studentId: SEED.students.sofia.id,
    convertedAt: SEED_AT,
    version: 2, // captured, then converted
    createdAt: SOFIA_CAPTURED_AT,
  },
} satisfies Record<string, SeedRow<typeof leads>>;

/** Berlin day of Sofia's conversion (`SEED_AT`), as `rm_lead_students.converted_on`. */
export const SOFIA_CONVERTED_ON = '2026-09-01';

/** The leads above, already projected: Berlin days in September 2026 (the seed month). */
export const LEAD_METRICS_DAYS: { day: string; leadsCaptured: number; leadsConverted: number }[] = [
  { day: SOFIA_CONVERTED_ON, leadsCaptured: 1, leadsConverted: 1 },
  { day: '2026-09-20', leadsCaptured: 1, leadsConverted: 0 },
];

type MetricsDay = Omit<typeof rmSchoolMetricsDaily.$inferInsert, 'schoolId' | 'day'>;

export const ZERO_METRICS: Omit<MetricsDay, 'leadsCaptured' | 'leadsConverted'> = {
  currency: CURRENCY,
  revenueInAppMinor: 0,
  revenueRecordedMinor: 0,
  refundsMinor: 0,
  lessonsCompleted: 0,
  lateCancellations: 0,
  lateCancelMinutesKept: 0,
  noShows: 0,
  upsellsSold: 0,
  upsellRevenueMinor: 0,
  packageMinutesSold: 0,
  slotsOffered: 0,
  slotsFilled: 0,
  slotFillMinutes: 0,
  instructorMinutesAvailable: 0,
  instructorMinutesBooked: 0,
  lessonsDue: 0,
  leadRevenueMinor: 0,
};

/**
 * September's growth report as the hourly job would write it from the rows above, so the growth
 * tab's leads funnel is filled straight after seeding (its default month is the previous one).
 */
export const SEPTEMBER_GROWTH_REPORT: SeedRow<typeof growthReports> = {
  id: seedId('growthReport', 1),
  month: '2026-09-01',
  currency: CURRENCY,
  revenueInAppMinor: 0,
  revenueRecordedMinor: 0,
  inappShareBp: 0,
  lateCancellationsKept: 0,
  lateCancelMinutesKept: 0,
  noShowRateBp: 0,
  noShowRatePrev3mBp: 0,
  upsellsSold: 0,
  upsellRevenueMinor: 0,
  slotsFilled: 0,
  slotFillMinutes: 0,
  leadsCaptured: LEAD_METRICS_DAYS.reduce((n, d) => n + d.leadsCaptured, 0),
  leadsConverted: LEAD_METRICS_DAYS.reduce((n, d) => n + d.leadsConverted, 0),
  leadRevenueMinor: 0,
  generatedAt: new Date('2026-10-01T01:00:00.000Z'),
};
