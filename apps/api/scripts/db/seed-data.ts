import type { priceItems } from '../../src/modules/billing/infra/schema.js';
import type { users } from '../../src/modules/identity/infra/schema.js';
import type { plans } from '../../src/modules/platform/infra/schema.js';
import type { lessonTypes } from '../../src/modules/scheduling/infra/schema.js';
import type { branches, schools, vehicles } from '../../src/modules/school/infra/schema.js';
import type { students } from '../../src/modules/training/infra/schema.js';

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

const priceList = (
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

export const PRICE_LISTS: Record<SchoolKey, PriceItemSeed[]> = {
  berlin: priceList(1900, [6500, 60000, 2900, 15000]),
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
