import {
  type CreateSlotOfferRequest,
  type JoinWaitingListRequest,
  type SlotOffer,
  type WaitingListEntry,
} from '../dto/index.js';
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
import type { MockStore } from './store.js';
import { StatusCodes } from 'http-status-codes';

const MINUTE_MS = 60_000;
const MIN_LEAD_MS = 120 * MINUTE_MS;
const DEFAULT_TTL_MINUTES = 120;

function matchesFilter(query: URLSearchParams, name: string, value: string | boolean): boolean {
  const wanted = query.get(name);
  return wanted === null || wanted === String(value);
}

const waitingListResolvers: Record<string, MockResolver> = {
  'waitingList.list': (context) => {
    const { schoolId } = requireSchool(context);
    const query = context.url.searchParams;
    const items = [...context.store.waitingList.values()]
      .filter((record) => record.schoolId === schoolId)
      .map((record) => record.value)
      .filter(
        (entry) =>
          matchesFilter(query, 'active', entry.active) &&
          matchesFilter(query, 'studentId', entry.studentId) &&
          matchesFilter(query, 'lessonTypeId', entry.lessonTypeId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { body: page(items, context.url) };
  },
  'waitingList.join': (context) => {
    const { schoolId } = requireSchool(context);
    const request = body<JoinWaitingListRequest>(context);
    const student = inSchool(context.store.students, request.studentId, schoolId);
    inSchool(context.store.lessonTypes, request.lessonTypeId, schoolId);
    const duplicate = [...context.store.waitingList.values()].some(
      ({ schoolId: owner, value }) =>
        owner === schoolId &&
        value.active &&
        value.studentId === request.studentId &&
        value.lessonTypeId === request.lessonTypeId,
    );
    if (duplicate)
      fail(
        StatusCodes.CONFLICT,
        'already_on_waiting_list',
        'This student is already on the waiting list for this lesson type.',
      );
    const entry: WaitingListEntry = {
      id: context.store.nextId(),
      studentId: request.studentId,
      studentName: student.value.fullName,
      lessonTypeId: request.lessonTypeId,
      preferredWindows: request.preferredWindows,
      area: request.area,
      active: true,
      createdAt: context.store.isoNow(),
    };
    context.store.waitingList.set(entry.id, { schoolId, version: 1, value: entry });
    return { body: commandResult(entry.id, 1) };
  },
  'waitingList.leave': (context) => {
    const { schoolId } = requireSchool(context);
    const record = inSchool(context.store.waitingList, context.params.id, schoolId);
    if (record.value.active) {
      record.value = { ...record.value, active: false };
      record.version += 1;
    }
    return {};
  },
};

function slotUnavailable(reason: string): never {
  return fail(StatusCodes.CONFLICT, 'slot_unavailable', 'This slot cannot be offered.', {
    reason,
  });
}

function instructorBusy(store: MockStore, schoolId: string, offer: SlotOffer): boolean {
  const overlaps = (start: string, end: string) =>
    Date.parse(start) < Date.parse(offer.end) && Date.parse(offer.start) < Date.parse(end);
  const lessons = [...store.lessons.values()].some(
    ({ schoolId: owner, value }) =>
      owner === schoolId &&
      value.status === 'booked' &&
      value.instructorMembershipId === offer.instructorMembershipId &&
      overlaps(value.start, value.end),
  );
  const offers = [...store.slotOffers.values()].some(
    ({ schoolId: owner, value }) =>
      owner === schoolId &&
      value.status === 'open' &&
      value.instructorMembershipId === offer.instructorMembershipId &&
      overlaps(value.start, value.end),
  );
  return lessons || offers;
}

function eligibleStudents(
  context: MockContext,
  schoolId: string,
  request: CreateSlotOfferRequest,
): string[] {
  if (request.studentIds) {
    return request.studentIds.filter((id) => context.store.students.get(id)?.schoolId === schoolId);
  }
  return [...context.store.waitingList.values()]
    .filter(
      ({ schoolId: owner, value }) =>
        owner === schoolId && value.active && value.lessonTypeId === request.lessonTypeId,
    )
    .map(({ value }) => value.studentId);
}

const slotOfferResolvers: Record<string, MockResolver> = {
  'slotOffers.list': (context) => {
    const { schoolId } = requireSchool(context);
    const query = context.url.searchParams;
    const items = [...context.store.slotOffers.values()]
      .filter((record) => record.schoolId === schoolId)
      .map((record) => record.value)
      .filter((offer) => matchesFilter(query, 'status', offer.status))
      .sort((a, b) => a.start.localeCompare(b.start));
    return { body: page(items, context.url) };
  },
  'slotOffers.create': (context) => {
    const { schoolId } = requireSchool(context);
    const { store } = context;
    const request = body<CreateSlotOfferRequest>(context);
    const membership = store.memberships.get(request.instructorMembershipId);
    if (membership?.schoolId !== schoolId || !membership.roles.includes('instructor'))
      return notFound();
    const lessonType = inSchool(store.lessonTypes, request.lessonTypeId, schoolId).value;
    if (request.vehicleId) inSchool(store.vehicles, request.vehicleId, schoolId);
    const now = store.now().getTime();
    const start = Date.parse(request.start);
    const ttl = store.settings.get(schoolId)?.slotOfferTtlMinutes ?? DEFAULT_TTL_MINUTES;
    const expiresAt = Math.min(now + ttl * MINUTE_MS, start - MIN_LEAD_MS);
    if (expiresAt <= now) slotUnavailable('too_soon');
    const offer: SlotOffer = {
      id: store.nextId(),
      instructorMembershipId: request.instructorMembershipId,
      instructorName: store.membershipName(request.instructorMembershipId),
      vehicleId: request.vehicleId ?? null,
      lessonTypeId: lessonType.id,
      lessonTypeName: lessonType.name,
      creditMinutes: lessonType.creditMinutes,
      start: new Date(start).toISOString(),
      end: new Date(start + lessonType.minutes * MINUTE_MS).toISOString(),
      source: 'manual',
      status: 'open',
      expiresAt: new Date(expiresAt).toISOString(),
    };
    if (instructorBusy(store, schoolId, offer)) slotUnavailable('instructor_busy');
    if (eligibleStudents(context, schoolId, request).length === 0)
      fail(
        StatusCodes.CONFLICT,
        'no_eligible_students',
        'No student can take this slot: nobody on the waiting list or in the area has enough credit, the right licence class and this instructor.',
      );
    store.slotOffers.set(offer.id, { schoolId, version: 1, value: offer });
    return { body: commandResult(offer.id, 1) };
  },
};

export const schedulingOfferResolvers: Record<string, MockResolver> = {
  ...waitingListResolvers,
  ...slotOfferResolvers,
};
