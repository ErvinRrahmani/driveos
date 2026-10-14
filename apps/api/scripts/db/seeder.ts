import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceItems } from '../../src/modules/billing/infra/schema.js';
import { conversations, messages } from '../../src/modules/messaging/infra/schema.js';
import { memberships, platformAdmins, users } from '../../src/modules/identity/infra/schema.js';
import { plans, subscriptions } from '../../src/modules/platform/infra/schema.js';
import {
  availability,
  availabilityVersions,
  lessonTypes,
} from '../../src/modules/scheduling/infra/schema.js';
import {
  branches,
  openingHours,
  schoolSettings,
  schools,
  vehicles,
} from '../../src/modules/school/infra/schema.js';
import { questionPacks, questions } from '../../src/modules/theory/infra/schema.js';
import {
  enrolments,
  guardianLinks,
  studentInstructors,
  rmStudentList,
  students,
  syllabusItems,
} from '../../src/modules/training/infra/schema.js';
import type { TenantContext, Transaction } from '../../src/kernel/tenant/tenant-context.js';
import {
  JsonQuestionBankImporter,
  loadQuestionPackFile,
} from '../../src/adapters/question-bank/json-question-bank-importer.js';
import {
  AVAILABILITY,
  AVAILABILITY_FROM,
  BRANCHES,
  CHAT_MESSAGES,
  LESSON_TYPES,
  LICENCE_CLASS,
  MEMBERSHIPS,
  OPENING_HOURS,
  PRICE_LISTS,
  SEED,
  SEED_AT,
  seedId,
  studentRows,
  SUBSCRIPTIONS,
  SYLLABUS_ITEMS,
  VEHICLES,
} from './seed-data.js';

export const PACKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packs');

type SchoolKey = keyof typeof SEED.schools;

export interface SeedLogin {
  name: string;
  label: string;
  phone: string | null;
  email: string | null;
  userId: string;
  schoolId: string | null;
  schoolName: string | null;
  membershipId: string | null;
  roles: string[];
}

export interface SeedResult {
  logins: SeedLogin[];
}

export interface SeedOptions {
  today: Date;
  packsDir?: string;
}

const SCHOOL_ORDER: SchoolKey[] = ['berlin', 'lisbon'];

export const fixtureId = (
  entity: Parameters<typeof seedId>[0],
  school: SchoolKey,
  index: number,
): string => seedId(entity, SCHOOL_ORDER.indexOf(school) * 100 + index + 1);

async function seedGlobal(tx: Transaction, packsDir: string): Promise<void> {
  await tx.insert(users).values(Object.values(SEED.users)).onConflictDoNothing();
  await tx
    .insert(platformAdmins)
    .values({ userId: SEED.users.platformAdmin.id })
    .onConflictDoNothing();
  await tx.insert(plans).values(Object.values(SEED.plans)).onConflictDoNothing();

  const pack = await loadQuestionPackFile(
    new JsonQuestionBankImporter(),
    path.join(packsDir, SEED.questionPack.file),
  );
  await tx
    .insert(questionPacks)
    .values({
      id: SEED.questionPack.id,
      countryCode: pack.countryCode,
      licenceClass: pack.licenceClass,
      language: pack.language,
      version: pack.version,
      examRules: pack.exam,
      status: 'published',
      publishedAt: SEED_AT,
    })
    .onConflictDoNothing();
  await tx
    .insert(questions)
    .values(
      pack.questions.map((question, index) => ({
        ...question,
        id: seedId('question', index + 1),
        packId: SEED.questionPack.id,
      })),
    )
    .onConflictDoNothing();
}

async function seedSchool(tx: Transaction, key: SchoolKey, today: Date): Promise<void> {
  const schoolId = SEED.schools[key].id;
  await tx.insert(schools).values(SEED.schools[key]).onConflictDoNothing();
  await tx.insert(schoolSettings).values({ schoolId }).onConflictDoNothing();
  await tx.insert(branches).values(BRANCHES[key]).onConflictDoNothing();
  await tx
    .insert(openingHours)
    .values(
      OPENING_HOURS.map((hours, index) => ({
        id: fixtureId('openingHours', key, index),
        schoolId,
        branchId: null,
        ...hours,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(subscriptions)
    .values(
      SUBSCRIPTIONS.filter((sub) => sub.school === key).map((sub) => ({
        id: sub.id,
        schoolId,
        planId: SEED.plans[sub.plan].id,
        startedAt: SEED_AT,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(memberships)
    .values(
      MEMBERSHIPS.filter((m) => m.school === key).map((m) => ({
        id: m.id,
        schoolId,
        userId: SEED.users[m.user].id,
        roles: m.roles,
        status: m.status,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(vehicles)
    .values(VEHICLES.filter((vehicle) => vehicle.schoolId === schoolId))
    .onConflictDoNothing();
  await tx
    .insert(lessonTypes)
    .values(
      LESSON_TYPES.map((type, index) => ({
        id: fixtureId('lessonType', key, index),
        schoolId,
        ...type,
      })),
    )
    .onConflictDoNothing();
  const instructors = MEMBERSHIPS.filter(
    (m) => m.school === key && (m.roles as readonly string[]).includes('instructor'),
  );
  await tx
    .insert(availability)
    .values(
      instructors.flatMap((m, i) =>
        AVAILABILITY.map((window, j) => ({
          id: fixtureId('availability', key, i * AVAILABILITY.length + j),
          schoolId,
          instructorMembershipId: m.id,
          ...window,
          validFrom: AVAILABILITY_FROM,
        })),
      ),
    )
    .onConflictDoNothing();
  await tx
    .insert(availabilityVersions)
    .values(instructors.map((m) => ({ schoolId, instructorMembershipId: m.id, version: 1 })))
    .onConflictDoNothing();
  await tx
    .insert(syllabusItems)
    .values(
      SYLLABUS_ITEMS.map((item, index) => ({
        id: fixtureId('syllabusItem', key, index),
        schoolId,
        licenceClass: LICENCE_CLASS,
        sortOrder: index + 1,
        ...item,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(priceItems)
    .values(
      PRICE_LISTS[key].map((item, index) => ({
        id: fixtureId('priceItem', key, index),
        schoolId,
        ...item,
      })),
    )
    .onConflictDoNothing();

  const roster = studentRows(today).filter((student) => student.schoolId === schoolId);
  if (roster.length === 0) return;
  await tx.insert(students).values(roster).onConflictDoNothing();
  await tx
    .insert(enrolments)
    .values(
      roster.map((student, index) => ({
        id: fixtureId('enrolment', key, index),
        schoolId,
        studentId: student.id,
        courseName: 'Class B course',
        licenceClass: LICENCE_CLASS,
        startedAt: SEED_AT,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(studentInstructors)
    .values(
      roster.map((student, index) => ({
        id: fixtureId('studentInstructor', key, index),
        schoolId,
        studentId: student.id,
        instructorMembershipId: SEED.memberships.berlinInstructor,
        isPrimary: true,
        assignedAt: SEED_AT,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(rmStudentList)
    .values(
      roster.map((student) => ({
        schoolId,
        studentId: student.id,
        fullName: student.fullName ?? '',
        licenceClass: student.licenceClass,
        status: student.status,
        primaryInstructorName: SEED.users.berlinInstructor.fullName,
        balanceMinutes: 0,
        progressPct: 0,
      })),
    )
    .onConflictDoNothing();
  await tx
    .insert(guardianLinks)
    .values({
      id: fixtureId('guardianLink', key, 0),
      schoolId,
      studentId: SEED.students.minor.id,
      guardianUserId: SEED.users.guardian.id,
    })
    .onConflictDoNothing();
  await seedChats(
    tx,
    key,
    roster.map((student) => student.id),
  );
}

const MINUTE_MS = 60_000;

async function seedChats(tx: Transaction, key: SchoolKey, studentIds: string[]): Promise<void> {
  const schoolId = SEED.schools[key].id;
  const instructorMembershipId = SEED.memberships.berlinInstructor;
  const chatId = (studentId: string, withInstructor: boolean) =>
    fixtureId(
      'conversation',
      key,
      studentIds.indexOf(studentId) + (withInstructor ? studentIds.length : 0),
    );
  const chatMessages = CHAT_MESSAGES.filter((message) =>
    studentIds.includes(SEED.students[message.student].id),
  ).map((message, index) => ({
    id: fixtureId('message', key, index),
    schoolId,
    conversationId: chatId(SEED.students[message.student].id, message.withInstructor),
    senderUserId: SEED.users[message.sender].id,
    body: message.body,
    sentAt: new Date(SEED_AT.getTime() + message.minutesAfterSeed * MINUTE_MS),
  }));
  const lastMessageAt = (conversationId: string): Date | null => {
    const times = chatMessages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => message.sentAt.getTime());
    return times.length > 0 ? new Date(Math.max(...times)) : null;
  };
  const rows = studentIds.flatMap((studentId) =>
    [false, true].map((withInstructor) => ({
      id: chatId(studentId, withInstructor),
      schoolId,
      kind: withInstructor ? ('student_instructor' as const) : ('student_school' as const),
      studentId,
      instructorMembershipId: withInstructor ? instructorMembershipId : null,
      lastMessageAt: lastMessageAt(chatId(studentId, withInstructor)),
    })),
  );
  await tx.insert(conversations).values(rows).onConflictDoNothing();
  if (chatMessages.length > 0) await tx.insert(messages).values(chatMessages).onConflictDoNothing();
}

function ownerOf(key: SchoolKey): string {
  const owner = MEMBERSHIPS.find((m) => m.school === key && m.roles.includes('owner'));
  if (!owner) throw new Error(`No owner seeded for ${key}`);
  return SEED.users[owner.user].id;
}

function logins(): SeedLogin[] {
  return Object.entries(SEED.users).map(([key, user]) => {
    const membership = MEMBERSHIPS.find((m) => m.user === key);
    const school = membership ? SEED.schools[membership.school] : null;
    return {
      name: user.fullName,
      label: membership?.label ?? 'Platform admin',
      phone: user.phone ?? null,
      email: user.email ?? null,
      userId: user.id,
      schoolId: school?.id ?? null,
      schoolName: school?.name ?? null,
      membershipId: membership?.id ?? null,
      roles: membership ? [...membership.roles] : ['platform_admin'],
    };
  });
}

export async function seedDatabase(
  tenant: TenantContext,
  options: SeedOptions,
): Promise<SeedResult> {
  const packsDir = options.packsDir ?? PACKS_DIR;
  await tenant.runAsSystem((tx) => seedGlobal(tx, packsDir));
  for (const key of SCHOOL_ORDER) {
    await tenant.runInTenant({ schoolId: SEED.schools[key].id, userId: ownerOf(key) }, () =>
      seedSchool(tenant.tx, key, options.today),
    );
  }
  return { logins: logins() };
}
