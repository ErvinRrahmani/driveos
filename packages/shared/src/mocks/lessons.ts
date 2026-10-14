import {
  type AdjustLedgerRequest,
  type BookLessonRequest,
  type BookedVia,
  calendarQuerySchema,
  type CancelLessonRequest,
  type LessonResponse,
  type MoveLessonRequest,
} from '../dto/index.js';
import { DTO_SAMPLES } from '../dto/samples/index.js';
import {
  body,
  commandResult,
  fail,
  inSchool,
  type MockContext,
  type MockResolver,
  notFound,
  page,
  requireSchool,
} from './context.js';
import { ENTITY, seedId } from './fixtures/ids.js';
import { QUESTION_PACK_FIXTURE } from './fixtures/question-pack.js';
import type { MockMembership, MockStore, Scoped } from './store.js';
import { StatusCodes } from 'http-status-codes';

const overlaps = (a: LessonResponse, b: LessonResponse) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

function assertNoClash(store: MockStore, schoolId: string, lesson: LessonResponse): void {
  const clash = [...store.lessons.values()].find(
    ({ schoolId: owner, value: other }) =>
      owner === schoolId &&
      other.id !== lesson.id &&
      other.status === 'booked' &&
      overlaps(lesson, other) &&
      (other.instructorMembershipId === lesson.instructorMembershipId ||
        other.studentId === lesson.studentId ||
        (lesson.vehicleId !== null && other.vehicleId === lesson.vehicleId)),
  );
  if (clash) {
    fail(
      StatusCodes.CONFLICT,
      'lesson_conflict',
      'The instructor, vehicle or student is already booked then.',
      {
        lessonId: clash.value.id,
      },
    );
  }
}

function bookedVia(membership: MockMembership): BookedVia {
  if (membership.roles.includes('student')) return 'student';
  if (membership.roles.includes('parent')) return 'parent';
  if (membership.roles.some((role) => role === 'owner' || role === 'office')) return 'office';
  return 'instructor';
}

function instructor(store: MockStore, membershipId: string, schoolId: string): MockMembership {
  const membership = store.memberships.get(membershipId);
  if (!membership || membership.schoolId !== schoolId || !membership.roles.includes('instructor')) {
    return notFound();
  }
  return membership;
}

function lessonFor(context: MockContext): { schoolId: string; record: Scoped<LessonResponse> } {
  const { schoolId } = requireSchool(context);
  const record = inSchool(context.store.lessons, context.params.id, schoolId);
  const version = (context.body as { version?: number } | undefined)?.version;
  if (version !== undefined && version !== record.version) {
    fail(StatusCodes.CONFLICT, 'version_conflict', 'The lesson was changed by someone else.', {
      serverVersion: record.value,
    });
  }
  if (record.value.status !== 'booked')
    fail(StatusCodes.CONFLICT, 'lesson_not_booked', 'The lesson is no longer booked.');
  return { schoolId, record };
}

function settle(context: MockContext, status: LessonResponse['status']): ReturnType<MockResolver> {
  const { record } = lessonFor(context);
  record.version += 1;
  record.value = { ...record.value, status, version: record.version };
  return { body: commandResult(record.value.id, record.version) };
}

function scheduleFields(
  store: MockStore,
  schoolId: string,
  base: Pick<
    LessonResponse,
    'studentId' | 'instructorMembershipId' | 'lessonTypeId' | 'vehicleId' | 'start'
  >,
) {
  const lessonType = inSchool(store.lessonTypes, base.lessonTypeId, schoolId).value;
  const vehicle = base.vehicleId ? inSchool(store.vehicles, base.vehicleId, schoolId).value : null;
  const start = new Date(base.start);
  return {
    instructorName: store.membershipName(
      instructor(store, base.instructorMembershipId, schoolId).id,
    ),
    vehiclePlate: vehicle?.plate ?? null,
    lessonTypeName: lessonType.name,
    lessonTypeKind: lessonType.kind,
    creditMinutes: lessonType.creditMinutes,
    start: start.toISOString(),
    end: new Date(start.getTime() + lessonType.minutes * 60_000).toISOString(),
  };
}

export function bookLesson(
  context: MockContext,
  request: BookLessonRequest,
  overrides: { id?: string; bookedVia?: BookedVia } = {},
): LessonResponse {
  const { store } = context;
  const { schoolId, membership } = requireSchool(context);
  const student = inSchool(store.students, request.studentId, schoolId).value;
  const branch = [...store.branches.values()].find((record) => record.schoolId === schoolId)?.value;
  const lesson: LessonResponse = {
    id: overrides.id ?? store.nextId(),
    studentId: student.id,
    studentName: student.fullName,
    instructorMembershipId: request.instructorMembershipId,
    vehicleId: request.vehicleId ?? null,
    lessonTypeId: request.lessonTypeId,
    ...scheduleFields(store, schoolId, { ...request, vehicleId: request.vehicleId ?? null }),
    status: 'booked',
    pickupAddress: request.pickupAddress ?? student.pickupAddress ?? branch?.address ?? '',
    pickupLat: request.pickupLat ?? student.pickupLat ?? branch?.lat ?? 0,
    pickupLng: request.pickupLng ?? student.pickupLng ?? branch?.lng ?? 0,
    bookedVia: overrides.bookedVia ?? bookedVia(membership),
    bookedByMembershipId: membership.id,
    lateCancel: false,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
  };
  assertNoClash(store, schoolId, lesson);
  const allowNegative = store.settings.get(schoolId)?.allowNegativeBalance ?? false;
  if (!allowNegative && store.balance(student.id) < lesson.creditMinutes) {
    fail(
      StatusCodes.CONFLICT,
      'insufficient_balance',
      'The student does not have enough lesson credit.',
    );
  }
  store.lessons.set(lesson.id, { schoolId, version: 1, value: lesson });
  if (lesson.creditMinutes > 0) {
    store.appendLedger(schoolId, student.id, {
      entryType: 'debit',
      minutes: -lesson.creditMinutes,
      lessonId: lesson.id,
      createdByMembershipId: membership.id,
    });
  }
  return lesson;
}

export const lessonResolvers: Record<string, MockResolver> = {
  'calendar.get': (context) => {
    const { schoolId } = requireSchool(context);
    const parsed = calendarQuerySchema.safeParse(Object.fromEntries(context.url.searchParams));
    if (!parsed.success)
      fail(
        StatusCodes.BAD_REQUEST,
        'validation_error',
        'The query is invalid.',
        parsed.error.issues,
      );
    const { from, to, instructorId, vehicleId, studentId } = parsed.data;
    const items = [...context.store.lessons.values()]
      .filter(({ schoolId: owner }) => owner === schoolId)
      .map(({ value }) => value)
      .filter(
        (lesson) =>
          Date.parse(lesson.start) < Date.parse(to) &&
          Date.parse(lesson.end) > Date.parse(from) &&
          (instructorId ?? lesson.instructorMembershipId) === lesson.instructorMembershipId &&
          (vehicleId ?? lesson.vehicleId) === lesson.vehicleId &&
          (studentId ?? lesson.studentId) === lesson.studentId,
      )
      .sort((a, b) => a.start.localeCompare(b.start));
    return { body: page(items, context.url) };
  },

  'lessons.book': (context) => ({
    body: bookLesson(context, body<BookLessonRequest>(context)),
  }),

  'lessons.move': (context) => {
    const { schoolId, record } = lessonFor(context);
    const { version: _version, ...changes } = body<MoveLessonRequest>(context);
    const merged = { ...record.value, ...changes };
    const next: LessonResponse = {
      ...merged,
      ...scheduleFields(context.store, schoolId, merged),
      version: record.version + 1,
    };
    assertNoClash(context.store, schoolId, next);
    record.version = next.version;
    record.value = next;
    return { body: commandResult(next.id, next.version) };
  },

  'lessons.cancel': (context) => {
    const { store } = context;
    const { schoolId, record } = lessonFor(context);
    const request = body<CancelLessonRequest>(context);
    const { membership } = requireSchool(context);
    const role = bookedVia(membership);
    const windowHours = store.settings.get(schoolId)?.cancellationWindowHours ?? 24;
    const insideWindow =
      Date.parse(record.value.start) - store.now().getTime() < windowHours * 3_600_000;
    const restoreCredit = request.restoreCredit;
    if (restoreCredit !== undefined && (role === 'student' || role === 'parent')) {
      fail(
        StatusCodes.BAD_REQUEST,
        'validation_error',
        'restoreCredit is only accepted from staff.',
      );
    }
    if (restoreCredit === false && (role !== 'office' || !insideWindow)) {
      fail(
        StatusCodes.BAD_REQUEST,
        'validation_error',
        'Only owner/office may keep the credit, and only inside the cancellation window.',
      );
    }
    const late =
      role === 'office' || role === 'instructor' ? restoreCredit === false : insideWindow;
    const minutesRestored = late ? 0 : record.value.creditMinutes;
    if (minutesRestored > 0) {
      store.appendLedger(schoolId, record.value.studentId, {
        entryType: 'restore',
        minutes: minutesRestored,
        lessonId: record.value.id,
        createdByMembershipId: membership.id,
      });
    }
    record.version += 1;
    record.value = {
      ...record.value,
      status: 'cancelled',
      lateCancel: late,
      cancelledAt: store.isoNow(),
      cancelReason: request.reason ?? null,
      version: record.version,
    };
    return { body: { id: record.value.id, version: record.version, late, minutesRestored } };
  },

  'lessons.complete': (context) => settle(context, 'completed'),
  'lessons.markNoShow': (context) => settle(context, 'no_show'),

  'balance.get': (context) => {
    const { schoolId } = requireSchool(context);
    const student = inSchool(context.store.students, context.params.id, schoolId).value;
    return {
      body: {
        studentId: student.id,
        balanceMinutes: context.store.balance(student.id),
        entitlements: [],
      },
    };
  },

  'ledger.list': (context) => {
    const { schoolId } = requireSchool(context);
    const student = inSchool(context.store.students, context.params.id, schoolId).value;
    const items = context.store.ledger
      .filter((line) => line.studentId === student.id)
      .map((line) => line.entry)
      .reverse();
    return { body: page(items, context.url) };
  },

  'ledger.adjust': (context) => {
    const { store } = context;
    const { schoolId, membership } = requireSchool(context);
    const request = body<AdjustLedgerRequest>(context);
    const student = inSchool(store.students, request.studentId, schoolId).value;
    if (store.balance(student.id) + request.minutes < 0) {
      fail(StatusCodes.CONFLICT, 'insufficient_balance', 'The balance cannot go below zero.');
    }
    const entry = store.appendLedger(schoolId, student.id, {
      entryType: 'adjustment',
      minutes: request.minutes,
      lessonId: request.lessonId ?? null,
      note: request.note ?? null,
      createdByMembershipId: membership.id,
    });
    return { body: { id: entry.id, balanceAfter: entry.balanceAfter } };
  },

  'questionPacks.current': (context) => {
    requireSchool(context);
    const pack = QUESTION_PACK_FIXTURE;
    return {
      body: {
        ...DTO_SAMPLES.theory.questionPack,
        id: seedId(ENTITY.questionPack, 1),
        countryCode: pack.country,
        licenceClass: pack.licenceClass,
        language: pack.language,
        questionCount: pack.questions.length,
        categories: [...new Set(pack.questions.map((question) => question.category))].sort(),
        exam: pack.exam,
      },
    };
  },

  'theorySessions.start': (context) => {
    requireSchool(context);
    const questions = QUESTION_PACK_FIXTURE.questions
      .slice(0, QUESTION_PACK_FIXTURE.exam.questions)
      .map((question, index) => ({
        id: seedId(ENTITY.question, index + 1),
        category: question.category,
        body: question.body,
        mediaUrl: null,
        answers: [...question.answers],
        points: question.points,
      }));
    return {
      body: {
        ...DTO_SAMPLES.theory.theorySessionResponse,
        id: context.store.nextId(),
        packId: seedId(ENTITY.questionPack, 1),
        questionIds: questions.map((question) => question.id),
        questions,
      },
    };
  },
};
