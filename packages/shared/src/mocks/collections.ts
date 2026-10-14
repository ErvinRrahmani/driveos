import type {
  Branch,
  CreateStudentRequest,
  LessonType,
  Plan,
  PriceItem,
  ShopResponse,
  StaffMember,
  StudentListItem,
  UpdateSchoolSettingsRequest,
  UpdateStudentRequest,
  Vehicle,
} from '../dto/index.js';
import {
  body,
  commandResult,
  inSchool,
  type MockContext,
  type MockResolver,
  page,
  requireSchool,
  requireSession,
} from './context.js';
import type { MockStore, MockStudent, Scoped } from './store.js';

type Query = URLSearchParams;

interface CollectionOptions<T extends { id: string }> {
  records: (store: MockStore) => Map<string, Scoped<T>>;
  global?: boolean;
  matches?: (item: T, query: Query) => boolean;
}

function schoolOf(context: MockContext, global: boolean): string | null {
  if (global) {
    requireSession(context);
    return null;
  }
  return requireSchool(context).schoolId;
}

const flag = (query: Query, name: string, value: boolean) =>
  query.get(name) === null || query.get(name) === String(value);

function collection<T extends { id: string }>(options: CollectionOptions<T>) {
  const global = options.global ?? false;
  const list: MockResolver = (context) => {
    const schoolId = schoolOf(context, global);
    const items = [...options.records(context.store).values()]
      .filter((record) => global || record.schoolId === schoolId)
      .map((record) => record.value)
      .filter((item) => options.matches?.(item, context.url.searchParams) ?? true);
    return { body: page(items, context.url) };
  };
  const create: MockResolver = (context) => {
    const schoolId = schoolOf(context, global);
    const id = context.store.nextId();
    const value = { ...body<Omit<T, 'id'>>(context), id } as T;
    options.records(context.store).set(id, { schoolId, version: 1, value });
    return { body: commandResult(id, 1) };
  };
  const update: MockResolver = (context) => {
    const schoolId = schoolOf(context, global);
    const record = inSchool(options.records(context.store), context.params.id, schoolId ?? '');
    record.value = { ...record.value, ...body<Partial<T>>(context) };
    record.version += 1;
    return { body: commandResult(record.value.id, record.version) };
  };
  return { list, create, update };
}

const branches = collection<Branch>({ records: (store) => store.branches });
const vehicles = collection<Vehicle>({
  records: (store) => store.vehicles,
  matches: (item, query) =>
    flag(query, 'active', item.active) &&
    (query.get('branchId') ?? item.branchId) === item.branchId,
});
const lessonTypes = collection<LessonType>({
  records: (store) => store.lessonTypes,
  matches: (item, query) => flag(query, 'active', item.active),
});
const priceItems = collection<PriceItem>({
  records: (store) => store.priceItems,
  matches: (item, query) =>
    flag(query, 'active', item.active) && (query.get('kind') ?? item.kind) === item.kind,
});
const plans = collection<Plan>({
  records: (store) => store.plans,
  global: true,
  matches: (item, query) => flag(query, 'active', item.active),
});

function studentListItem(store: MockStore, student: MockStudent): StudentListItem {
  const now = store.now().getTime();
  const starts = [...store.lessons.values()]
    .map((record) => record.value)
    .filter((lesson) => lesson.studentId === student.id && lesson.status !== 'cancelled')
    .map((lesson) => lesson.start)
    .sort();
  return {
    id: student.id,
    fullName: student.fullName,
    licenceClass: student.licenceClass,
    status: student.status,
    primaryInstructorName:
      student.instructors.find((instructor) => instructor.isPrimary)?.instructorName ?? null,
    balanceMinutes: store.balance(student.id),
    nextLessonAt: starts.find((start) => Date.parse(start) >= now) ?? null,
    lastLessonAt: starts.filter((start) => Date.parse(start) < now).pop() ?? null,
    progressPct: student.progressPct,
    updatedAt: student.updatedAt,
  };
}

function publicStudent(student: MockStudent) {
  const { updatedAt: _updatedAt, progressPct: _progressPct, ...response } = student;
  return response;
}

/** Stores a new student, as `POST /v1/students` and lead conversion do. */
export function addStudent(
  store: MockStore,
  schoolId: string,
  request: CreateStudentRequest & { phone?: string | null; email?: string | null },
): string {
  const {
    primaryInstructorMembershipId: _primaryInstructorMembershipId,
    enrolment: _enrolment,
    ...fields
  } = request;
  const id = store.nextId();
  store.students.set(id, {
    schoolId,
    version: 1,
    value: {
      id,
      userId: null,
      phone: null,
      email: null,
      testDate: null,
      area: null,
      pickupAddress: null,
      pickupLat: null,
      pickupLng: null,
      ...fields,
      isMinor: store.isMinor(fields.dateOfBirth, schoolId),
      status: 'active',
      enrolments: [],
      instructors: [],
      guardians: [],
      updatedAt: store.isoNow(),
      progressPct: 0,
    },
  });
  return id;
}

const students: Record<string, MockResolver> = {
  'students.list': (context) => {
    const { schoolId } = requireSchool(context);
    const query = context.url.searchParams;
    const needle = query.get('q')?.toLowerCase();
    const items = [...context.store.students.values()]
      .filter((record) => record.schoolId === schoolId)
      .map((record) => record.value)
      .filter(
        (student) =>
          (!needle || student.fullName.toLowerCase().includes(needle)) &&
          (query.get('status') ?? student.status) === student.status &&
          (!query.get('instructorId') ||
            student.instructors.some(
              (instructor) => instructor.instructorMembershipId === query.get('instructorId'),
            )),
      )
      .map((student) => studentListItem(context.store, student));
    return { body: page(items, context.url) };
  },
  'students.get': (context) => {
    const { schoolId } = requireSchool(context);
    return {
      body: publicStudent(inSchool(context.store.students, context.params.id, schoolId).value),
    };
  },
  'students.create': (context) => {
    const { schoolId } = requireSchool(context);
    const id = addStudent(context.store, schoolId, body<CreateStudentRequest>(context));
    return { body: commandResult(id, 1) };
  },
  'students.update': (context) => {
    const { schoolId } = requireSchool(context);
    const record = inSchool(context.store.students, context.params.id, schoolId);
    const next = { ...record.value, ...body<UpdateStudentRequest>(context) };
    record.value = {
      ...next,
      isMinor: context.store.isMinor(next.dateOfBirth, schoolId),
      updatedAt: context.store.isoNow(),
    };
    record.version += 1;
    return { body: commandResult(record.value.id, record.version) };
  },
};

const school: Record<string, MockResolver> = {
  'school.get': (context) => {
    const { schoolId } = requireSchool(context);
    return { body: context.store.schools.get(schoolId) };
  },
  'schoolSettings.get': (context) => {
    const { schoolId } = requireSchool(context);
    return { body: context.store.settings.get(schoolId) };
  },
  'schoolSettings.update': (context) => {
    const { schoolId } = requireSchool(context);
    const current = context.store.settings.get(schoolId);
    if (current) {
      context.store.settings.set(schoolId, {
        ...current,
        ...body<UpdateSchoolSettingsRequest>(context),
      });
    }
    return { body: commandResult(schoolId, 2) };
  },
  'staff.list': (context) => {
    const { schoolId } = requireSchool(context);
    const role = context.url.searchParams.get('role');
    const items: StaffMember[] = [...context.store.memberships.values()]
      .filter(
        (membership) =>
          membership.schoolId === schoolId &&
          membership.roles.some((candidate) =>
            ['owner', 'office', 'instructor'].includes(candidate),
          ) &&
          (!role || membership.roles.some((candidate) => candidate === role)),
      )
      .map((membership) => {
        const user = context.store.users.get(membership.userId);
        return {
          membershipId: membership.id,
          userId: membership.userId,
          fullName: user?.fullName ?? '',
          phone: user?.phone ?? null,
          email: user?.email ?? null,
          roles: [...membership.roles],
          status: membership.status,
        };
      });
    return { body: page(items, context.url) };
  },
  'shop.get': (context) => {
    const { schoolId } = requireSchool(context);
    const studentId = context.url.searchParams.get('studentId') ?? undefined;
    const student = inSchool(context.store.students, studentId, schoolId).value;
    const shop: ShopResponse = {
      studentId: student.id,
      checkoutEnabled: context.store.schools.get(schoolId)?.paymentAccount?.status === 'active',
      balanceMinutes: context.store.balance(student.id),
      items: [...context.store.priceItems.values()]
        .filter((record) => record.schoolId === schoolId && record.value.active)
        .map(({ value }) => ({
          id: value.id,
          name: value.name,
          kind: value.kind,
          creditMinutes: value.creditMinutes,
          entitlementKind: value.entitlementKind,
          amountMinor: value.amountMinor,
          currency: value.currency,
          owned: false,
        })),
    };
    return { body: shop };
  },
};

export const collectionResolvers: Record<string, MockResolver> = {
  'branches.list': branches.list,
  'branches.create': branches.create,
  'branches.update': branches.update,
  'vehicles.list': vehicles.list,
  'vehicles.create': vehicles.create,
  'vehicles.update': vehicles.update,
  'lessonTypes.list': lessonTypes.list,
  'lessonTypes.create': lessonTypes.create,
  'lessonTypes.update': lessonTypes.update,
  'priceItems.list': priceItems.list,
  'priceItems.create': priceItems.create,
  'priceItems.update': priceItems.update,
  'plans.list': plans.list,
  'plans.create': plans.create,
  'plans.update': plans.update,
  ...students,
  ...school,
};
