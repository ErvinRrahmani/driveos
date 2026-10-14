import type {
  Branch,
  Invitation,
  Lead,
  LedgerEntry,
  LessonResponse,
  LessonType,
  MembershipRole,
  MembershipStatus,
  Plan,
  PriceItem,
  PublicProfile,
  Review,
  SchoolResponse,
  SchoolSettings,
  SlotOffer,
  StudentResponse,
  SyncEntity,
  SyncOpResult,
  Vehicle,
  WaitingListEntry,
} from '../dto/index.js';
import { DTO_SAMPLES } from '../dto/samples/index.js';
import { LESSON_TYPE_FIXTURES, PRICE_ITEM_FIXTURES } from './fixtures/catalogue.js';
import { LEAD_FIXTURES, PUBLIC_PROFILE_FIXTURES, REVIEW_FIXTURES } from './fixtures/leads.js';
import {
  BERLIN,
  BRANCH_FIXTURES,
  PLAN_FIXTURES,
  SCHOOL_FIXTURES,
  VEHICLE_FIXTURES,
} from './fixtures/schools.js';
import {
  COURSE_NAME,
  ENROLMENT_STARTED_AT,
  GUARDIAN_LINK_FIXTURES,
  LESSON_FIXTURES,
  minorDateOfBirth,
  OPENING_CREDIT_MINUTES,
  PRIMARY_INSTRUCTOR_MEMBERSHIP,
  STUDENT_FIXTURES,
} from './fixtures/students.js';
import { MEMBERSHIP_FIXTURES, USER_FIXTURES } from './fixtures/users.js';

export interface MockUser {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  locale: string;
}

export interface MockMembership {
  id: string;
  userId: string;
  schoolId: string;
  roles: MembershipRole[];
  status: MembershipStatus;
  branchIds: string[];
  grants: string[];
  version: number;
}

export interface MockSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  activeMembershipId: string | null;
}

export interface Scoped<T> {
  schoolId: string | null;
  version: number;
  value: T;
}

export type MockStudent = StudentResponse & { updatedAt: string; progressPct: number };

export interface MockLedgerEntry {
  schoolId: string;
  studentId: string;
  entry: LedgerEntry;
}

export interface MockInvitation {
  token: string;
  schoolId: string;
  invitation: Invitation;
  acceptedAt: string | null;
}

export interface MockIdempotentReply {
  hash: string;
  status: number;
  body: unknown;
}

export interface MockSyncOperation {
  membershipId: string;
  result: SyncOpResult;
}

export interface MockChangeRow {
  seq: number;
  schoolId: string;
  entity: SyncEntity;
  entityId: string;
  op: 'upsert' | 'delete' | 'revoke';
  audienceMembershipId: string | null;
  at: string;
}

export interface MockStoreOptions {
  now?: () => Date;
  seed?: (store: MockStore) => unknown;
}

const OFFICE_MEMBERSHIP = MEMBERSHIP_FIXTURES[1]?.id ?? '';
const PROGRESS_PCT = [38, 52, 75, 20, 10];

export class MockStore {
  readonly users = new Map<string, MockUser>();
  readonly schools = new Map<string, SchoolResponse>();
  readonly settings = new Map<string, SchoolSettings>();
  readonly memberships = new Map<string, MockMembership>();
  readonly branches = new Map<string, Scoped<Branch>>();
  readonly vehicles = new Map<string, Scoped<Vehicle>>();
  readonly lessonTypes = new Map<string, Scoped<LessonType>>();
  readonly priceItems = new Map<string, Scoped<PriceItem>>();
  readonly plans = new Map<string, Scoped<Plan>>();
  readonly students = new Map<string, Scoped<MockStudent>>();
  readonly lessons = new Map<string, Scoped<LessonResponse>>();
  readonly waitingList = new Map<string, Scoped<WaitingListEntry>>();
  readonly slotOffers = new Map<string, Scoped<SlotOffer>>();
  readonly leads = new Map<string, Scoped<Lead>>();
  readonly reviews = new Map<string, Scoped<Review>>();
  /** The public page settings, by school id; a school without an entry has never saved them. */
  readonly publicProfiles = new Map<string, PublicProfile>();
  readonly invitations = new Map<string, MockInvitation>();
  readonly sessions = new Map<string, MockSession>();
  readonly idempotency = new Map<string, MockIdempotentReply>();
  readonly syncOperations = new Map<string, MockSyncOperation>();
  readonly feedState = new Map<string, string>();
  readonly syncStaleLessons = new Set<string>();
  changeFeed: MockChangeRow[] = [];
  ledger: MockLedgerEntry[] = [];
  currentAccessToken: string | null = null;
  readonly now: () => Date;
  private readonly seed: ((store: MockStore) => unknown) | undefined;
  private idCounter = 0;
  private tokenCounter = 0;

  constructor(options: MockStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.seed = options.seed;
    this.reset();
  }

  nextId(): string {
    this.idCounter += 1;
    return `0192f000-0200-7000-8000-${this.idCounter.toString(16).padStart(12, '0')}`;
  }

  nextToken(kind: string): string {
    this.tokenCounter += 1;
    return `mock-${kind}-${this.tokenCounter}`;
  }

  isoNow(): string {
    return this.now().toISOString();
  }

  currentSession(): MockSession | null {
    return this.currentAccessToken ? (this.sessions.get(this.currentAccessToken) ?? null) : null;
  }

  createSession(userId: string, activeMembershipId?: string | null): MockSession {
    const fallback = [...this.memberships.values()].find(
      (membership) => membership.userId === userId && membership.status === 'active',
    );
    const session: MockSession = {
      accessToken: this.nextToken('access'),
      refreshToken: this.nextToken('refresh'),
      userId,
      activeMembershipId:
        activeMembershipId === undefined ? (fallback?.id ?? null) : activeMembershipId,
    };
    this.sessions.set(session.accessToken, session);
    this.currentAccessToken = session.accessToken;
    return session;
  }

  endSession(accessToken: string): void {
    this.sessions.delete(accessToken);
    if (this.currentAccessToken === accessToken) this.currentAccessToken = null;
  }

  balance(studentId: string): number {
    return this.ledger
      .filter((line) => line.studentId === studentId)
      .reduce((sum, line) => sum + line.entry.minutes, 0);
  }

  appendLedger(
    schoolId: string,
    studentId: string,
    entry: Pick<LedgerEntry, 'entryType' | 'minutes'> & Partial<LedgerEntry>,
  ): LedgerEntry {
    const full: LedgerEntry = {
      id: this.nextId(),
      lessonId: null,
      paymentId: null,
      refundId: null,
      priceItemId: null,
      note: null,
      createdByMembershipId: null,
      createdAt: this.isoNow(),
      ...entry,
      balanceAfter: this.balance(studentId) + entry.minutes,
    };
    this.ledger.push({ schoolId, studentId, entry: full });
    return full;
  }

  userName(userId: string): string {
    return this.users.get(userId)?.fullName ?? '';
  }

  membershipName(membershipId: string): string {
    const membership = this.memberships.get(membershipId);
    return membership ? this.userName(membership.userId) : '';
  }

  /** The mock has no subscriptions; the Berlin demo school is on the Standard plan. */
  planFeatures(schoolId: string): string[] {
    if (schoolId !== BERLIN) return [];
    const standard = [...this.plans.values()].find((plan) => plan.value.code === 'standard');
    return standard ? [...standard.value.features] : [];
  }

  isMinor(dateOfBirth: string, schoolId: string): boolean {
    const ageOfMajority = this.settings.get(schoolId)?.ageOfMajority ?? 18;
    const now = this.now();
    const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const birthdayPassed =
      now.getUTCMonth() > birth.getUTCMonth() ||
      (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
    if (!birthdayPassed) age -= 1;
    return age < ageOfMajority;
  }

  reset(): void {
    for (const map of [
      this.users,
      this.schools,
      this.settings,
      this.memberships,
      this.branches,
      this.vehicles,
      this.lessonTypes,
      this.priceItems,
      this.plans,
      this.students,
      this.lessons,
      this.waitingList,
      this.slotOffers,
      this.leads,
      this.reviews,
      this.publicProfiles,
      this.invitations,
      this.sessions,
      this.idempotency,
      this.syncOperations,
      this.feedState,
    ]) {
      map.clear();
    }
    this.syncStaleLessons.clear();
    this.changeFeed = [];
    this.ledger = [];
    this.currentAccessToken = null;
    this.idCounter = 0;
    this.tokenCounter = 0;
    this.load();
    this.seed?.(this);
  }

  private load(): void {
    for (const user of USER_FIXTURES) this.users.set(user.id, { ...user });
    for (const school of SCHOOL_FIXTURES) {
      this.schools.set(school.id, {
        ...school,
        paymentAccount: school.id === BERLIN ? { ...DTO_SAMPLES.school.paymentAccount } : null,
      });
      this.settings.set(school.id, { ...DTO_SAMPLES.school.schoolSettings });
    }
    for (const membership of MEMBERSHIP_FIXTURES) {
      this.memberships.set(membership.id, {
        ...membership,
        roles: [...membership.roles],
        branchIds: [],
        grants: [],
        version: 1,
      });
    }
    for (const { schoolId, ...branch } of BRANCH_FIXTURES) {
      this.branches.set(branch.id, { schoolId, version: 1, value: branch });
    }
    for (const { schoolId, ...vehicle } of VEHICLE_FIXTURES) {
      this.vehicles.set(vehicle.id, {
        schoolId,
        version: 1,
        value: { ...vehicle, licenceClass: 'B', active: true },
      });
    }
    for (const { schoolId, ...lessonType } of LESSON_TYPE_FIXTURES) {
      this.lessonTypes.set(lessonType.id, {
        schoolId,
        version: 1,
        value: { ...lessonType, active: true },
      });
    }
    for (const { schoolId, ...priceItem } of PRICE_ITEM_FIXTURES) {
      this.priceItems.set(priceItem.id, {
        schoolId,
        version: 1,
        value: { ...priceItem, active: true },
      });
    }
    for (const plan of PLAN_FIXTURES) {
      this.plans.set(plan.id, {
        schoolId: null,
        version: 1,
        value: { ...plan, features: [...plan.features], active: true },
      });
    }
    this.loadStudents();
    this.loadLessons();
    const { waitingListEntry, slotOffer } = DTO_SAMPLES.scheduling;
    this.waitingList.set(waitingListEntry.id, {
      schoolId: BERLIN,
      version: 1,
      value: structuredClone(waitingListEntry),
    });
    this.slotOffers.set(slotOffer.id, {
      schoolId: BERLIN,
      version: 1,
      value: structuredClone(slotOffer),
    });
    for (const { schoolId, lead } of LEAD_FIXTURES) {
      this.leads.set(lead.id, { schoolId, version: lead.version, value: { ...lead } });
    }
    for (const { schoolId, review } of REVIEW_FIXTURES) {
      this.reviews.set(review.id, { schoolId, version: 1, value: { ...review } });
    }
    for (const { schoolId, profile } of PUBLIC_PROFILE_FIXTURES) {
      this.publicProfiles.set(schoolId, { ...profile });
    }
  }

  private loadStudents(): void {
    STUDENT_FIXTURES.forEach((fixture, index) => {
      const user = this.users.get(fixture.userId);
      const dateOfBirth = fixture.dateOfBirth ?? minorDateOfBirth(this.now());
      const guardians = GUARDIAN_LINK_FIXTURES.filter((link) => link.studentId === fixture.id).map(
        (link) => {
          const guardian = this.users.get(link.guardianUserId);
          return {
            id: link.id,
            guardianUserId: link.guardianUserId,
            fullName: guardian?.fullName ?? '',
            phone: guardian?.phone ?? null,
            email: guardian?.email ?? null,
            consentAt: null,
            consentTextVersion: null,
            revokedAt: null,
          };
        },
      );
      this.students.set(fixture.id, {
        schoolId: BERLIN,
        version: 1,
        value: {
          id: fixture.id,
          userId: fixture.userId,
          fullName: user?.fullName ?? '',
          phone: user?.phone ?? null,
          email: user?.email ?? null,
          dateOfBirth,
          isMinor: this.isMinor(dateOfBirth, BERLIN),
          licenceClass: 'B',
          examLanguage: 'en',
          testDate: null,
          area: fixture.area,
          pickupAddress: null,
          pickupLat: null,
          pickupLng: null,
          status: 'active',
          enrolments: [
            {
              id: fixture.enrolmentId,
              courseName: COURSE_NAME,
              licenceClass: 'B',
              startedAt: ENROLMENT_STARTED_AT,
              endedAt: null,
            },
          ],
          instructors: [
            {
              assignmentId: fixture.assignmentId,
              instructorMembershipId: PRIMARY_INSTRUCTOR_MEMBERSHIP,
              instructorName: this.membershipName(PRIMARY_INSTRUCTOR_MEMBERSHIP),
              isPrimary: true,
              assignedAt: ENROLMENT_STARTED_AT,
            },
          ],
          guardians,
          updatedAt: ENROLMENT_STARTED_AT,
          progressPct: PROGRESS_PCT[index] ?? 0,
        },
      });
      this.appendLedger(BERLIN, fixture.id, {
        entryType: 'purchase',
        minutes: OPENING_CREDIT_MINUTES,
        priceItemId: PRICE_ITEM_FIXTURES[1]?.id ?? null,
        createdByMembershipId: OFFICE_MEMBERSHIP,
        createdAt: ENROLMENT_STARTED_AT,
      });
    });
  }

  private loadLessons(): void {
    for (const fixture of LESSON_FIXTURES) {
      const lessonType = this.lessonTypes.get(fixture.lessonTypeId)?.value;
      if (!lessonType) continue;
      const start = new Date(fixture.start);
      this.lessons.set(fixture.id, {
        schoolId: BERLIN,
        version: 1,
        value: {
          id: fixture.id,
          studentId: fixture.studentId,
          studentName: this.students.get(fixture.studentId)?.value.fullName ?? '',
          instructorMembershipId: PRIMARY_INSTRUCTOR_MEMBERSHIP,
          instructorName: this.membershipName(PRIMARY_INSTRUCTOR_MEMBERSHIP),
          vehicleId: fixture.vehicleId,
          vehiclePlate: this.vehicles.get(fixture.vehicleId)?.value.plate ?? null,
          lessonTypeId: lessonType.id,
          lessonTypeName: lessonType.name,
          lessonTypeKind: lessonType.kind,
          creditMinutes: lessonType.creditMinutes,
          start: start.toISOString(),
          end: new Date(start.getTime() + lessonType.minutes * 60_000).toISOString(),
          status: 'booked',
          pickupAddress: fixture.pickupAddress,
          pickupLat: fixture.pickupLat,
          pickupLng: fixture.pickupLng,
          bookedVia: 'office',
          bookedByMembershipId: OFFICE_MEMBERSHIP,
          lateCancel: false,
          cancelledAt: null,
          cancelReason: null,
          version: 1,
        },
      });
      this.appendLedger(BERLIN, fixture.studentId, {
        entryType: 'debit',
        minutes: -lessonType.creditMinutes,
        lessonId: fixture.id,
        createdByMembershipId: OFFICE_MEMBERSHIP,
        createdAt: ENROLMENT_STARTED_AT,
      });
    }
  }
}
