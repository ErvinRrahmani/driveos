import type {
  AcceptSlotOfferRequest,
  AddTimeOffRequest,
  AvailabilityResponse,
  AvailabilityWindow,
  BookLessonRequest,
  CalendarAvailability,
  CalendarQuery,
  CalendarResponse,
  CalendarTimeOff,
  CancelLessonRequest,
  CancelLessonResponse,
  CompleteLessonRequest,
  CreateLessonTypeRequest,
  CreateSlotOfferRequest,
  FreeSlot,
  FreeSlotsQuery,
  FreeSlotsResponse,
  JoinWaitingListRequest,
  LessonResponse,
  LessonType,
  LessonTypeListResponse,
  ListLessonTypesQuery,
  ListSlotOffersQuery,
  ListWaitingListQuery,
  MarkNoShowRequest,
  MoveLessonRequest,
  PreferredWindow,
  ProgressInput,
  ReplaceAvailabilityRequest,
  SlotOffer,
  SlotOfferListResponse,
  SyncAvailability,
  SyncChange,
  SyncEntity,
  SyncOp,
  SyncOpResult,
  SyncProgressEntry,
  SyncPullQuery,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncStudent,
  TimeOff,
  UpdateLessonTypeRequest,
  WaitingListEntry,
  WaitingListResponse,
  WeeklyWindow,
} from '../scheduling.js';
import { SAMPLE_IDS as ids } from './fixtures.js';
import { schoolSamples } from './school.js';

const lessonType = {
  id: ids.lessonType,
  name: 'Standard lesson',
  kind: 'lesson',
  licenceClass: 'B',
  minutes: 60,
  creditMinutes: 60,
  requiresVehicle: true,
  requiresEntitlement: null,
  active: true,
} satisfies LessonType;

const lesson = {
  id: ids.lesson,
  studentId: ids.student,
  studentName: 'Stella Student',
  instructorMembershipId: ids.instructorMembership,
  instructorName: 'Ingo Instructor',
  vehicleId: ids.vehicle,
  vehiclePlate: 'B-DS 101',
  lessonTypeId: ids.lessonType,
  lessonTypeName: 'Standard lesson',
  lessonTypeKind: 'lesson',
  creditMinutes: 60,
  start: '2026-10-12T07:00:00.000Z',
  end: '2026-10-12T08:00:00.000Z',
  status: 'booked',
  pickupAddress: 'Friedrichstraße 100, 10117 Berlin',
  pickupLat: 52.52,
  pickupLng: 13.388,
  bookedVia: 'office',
  bookedByMembershipId: ids.officeMembership,
  lateCancel: false,
  cancelledAt: null,
  cancelReason: null,
  version: 1,
} satisfies LessonResponse;

const freeSlot = {
  start: '2026-10-13T08:00:00.000Z',
  end: '2026-10-13T09:00:00.000Z',
  instructorMembershipId: ids.instructorMembership,
  instructorName: 'Ingo Instructor',
  vehicleId: ids.vehicle,
} satisfies FreeSlot;

const weeklyWindow = { weekday: 1, startTime: '08:00', endTime: '16:00' } satisfies WeeklyWindow;

const availabilityWindow = {
  id: ids.availability,
  ...weeklyWindow,
  validFrom: '2026-09-01',
  validTo: null,
} satisfies AvailabilityWindow;

const timeOff = {
  id: ids.timeOff,
  start: '2026-10-19T00:00:00.000Z',
  end: '2026-10-24T00:00:00.000Z',
  reason: 'Holiday',
} satisfies TimeOff;

const calendarAvailability = {
  instructorMembershipId: ids.instructorMembership,
  start: '2026-10-12T06:00:00.000Z',
  end: '2026-10-12T14:00:00.000Z',
} satisfies CalendarAvailability;

const calendarTimeOff = {
  id: ids.timeOff,
  instructorMembershipId: ids.instructorMembership,
  start: '2026-10-16T00:00:00.000Z',
  end: '2026-10-17T00:00:00.000Z',
} satisfies CalendarTimeOff;

const syncStudent = {
  id: ids.student,
  fullName: 'Stella Student',
  phone: '+4915550000006',
  licenceClass: 'B',
  area: 'Mitte',
  pickupAddress: 'Friedrichstraße 100, 10117 Berlin',
  pickupLat: 52.52,
  pickupLng: 13.388,
  isPrimary: true,
} satisfies SyncStudent;

const syncProgressEntry = {
  id: ids.progressEntry,
  lessonId: ids.lesson,
  studentId: ids.student,
  syllabusItemId: ids.syllabusItem,
  level: 3,
  note: 'Mirror checks before moving off are now routine.',
  version: 2,
} satisfies SyncProgressEntry;

const syncAvailability = {
  instructorMembershipId: ids.instructorMembership,
  items: [availabilityWindow],
} satisfies SyncAvailability;

const syncChange = {
  seq: '1042',
  entityId: ids.lesson,
  at: '2026-10-08T09:30:00.000Z',
  op: 'upsert',
  entity: 'lesson',
  data: lesson,
} satisfies SyncChange;

const syncOp = {
  opId: ids.syncOp,
  clientAt: '2026-10-12T08:05:00.000Z',
  baseVersion: 1,
  type: 'lesson.complete',
  payload: { lessonId: ids.lesson },
} satisfies SyncOp;

const syncOpResult = {
  opId: ids.syncOp,
  status: 'applied',
  id: ids.lesson,
  version: 2,
  error: null,
  serverState: null,
} satisfies SyncOpResult;

const preferredWindow = { weekday: 2, start: '15:00', end: '19:00' } satisfies PreferredWindow;

const waitingListEntry = {
  id: ids.waitingList,
  studentId: ids.secondStudent,
  studentName: 'Sam Schulz',
  lessonTypeId: ids.lessonType,
  preferredWindows: [preferredWindow],
  area: 'Kreuzberg',
  active: true,
  createdAt: '2026-10-01T12:00:00.000Z',
} satisfies WaitingListEntry;

const slotOffer = {
  id: ids.slotOffer,
  instructorMembershipId: ids.instructorMembership,
  instructorName: 'Ingo Instructor',
  vehicleId: ids.vehicle,
  lessonTypeId: ids.lessonType,
  lessonTypeName: 'Standard lesson',
  creditMinutes: 60,
  start: '2026-10-14T14:00:00.000Z',
  end: '2026-10-14T15:00:00.000Z',
  source: 'cancellation',
  status: 'open',
  expiresAt: '2026-10-14T10:00:00.000Z',
} satisfies SlotOffer;

const progressInput = {
  syllabusItemId: ids.syllabusItem,
  level: 3,
  note: 'Smooth moving off on the hill.',
} satisfies ProgressInput;

export const schedulingSamples = {
  lessonType,
  listLessonTypesQuery: { active: 'true', limit: 50 } satisfies ListLessonTypesQuery,
  lessonTypeListResponse: {
    items: [
      lessonType,
      {
        ...lessonType,
        id: ids.examLessonType,
        name: 'Driving exam',
        kind: 'exam',
        creditMinutes: 0,
        requiresEntitlement: 'exam_car',
      },
    ],
    nextCursor: null,
  } satisfies LessonTypeListResponse,
  createLessonTypeRequest: {
    name: 'Motorway lesson',
    kind: 'lesson',
    licenceClass: 'B',
    minutes: 90,
    creditMinutes: 90,
    requiresVehicle: true,
    requiresEntitlement: null,
    active: true,
  } satisfies CreateLessonTypeRequest,
  updateLessonTypeRequest: { creditMinutes: 75 } satisfies UpdateLessonTypeRequest,
  lessonResponse: lesson,
  calendarQuery: {
    from: '2026-10-12T00:00:00.000Z',
    to: '2026-10-19T00:00:00.000Z',
    instructorId: ids.instructorMembership,
    limit: 200,
  } satisfies CalendarQuery,
  calendarResponse: {
    items: [
      lesson,
      {
        ...lesson,
        id: ids.secondLesson,
        studentId: ids.secondStudent,
        studentName: 'Sam Schulz',
        start: '2026-10-12T09:00:00.000Z',
        end: '2026-10-12T10:00:00.000Z',
        status: 'cancelled',
        bookedVia: 'student',
        lateCancel: true,
        cancelledAt: '2026-10-11T20:00:00.000Z',
        cancelReason: 'Ill',
        version: 2,
      },
    ],
    nextCursor: null,
    availability: [calendarAvailability],
    timeOff: [calendarTimeOff],
  } satisfies CalendarResponse,
  calendarAvailability,
  calendarTimeOff,
  freeSlotsQuery: {
    lessonTypeId: ids.lessonType,
    from: '2026-10-13T00:00:00.000Z',
    to: '2026-10-14T00:00:00.000Z',
  } satisfies FreeSlotsQuery,
  freeSlot,
  freeSlotsResponse: {
    items: [
      freeSlot,
      { ...freeSlot, start: '2026-10-13T12:00:00.000Z', end: '2026-10-13T13:00:00.000Z' },
    ],
  } satisfies FreeSlotsResponse,
  weeklyWindow,
  availabilityWindow,
  timeOff,
  availabilityResponse: {
    instructorMembershipId: ids.instructorMembership,
    items: [availabilityWindow],
    timeOff: [timeOff],
  } satisfies AvailabilityResponse,
  replaceAvailabilityRequest: {
    effectiveFrom: '2026-10-19',
    windows: [weeklyWindow, { weekday: 3, startTime: '12:00', endTime: '20:00' }],
  } satisfies ReplaceAvailabilityRequest,
  addTimeOffRequest: {
    start: '2026-10-19T00:00:00.000Z',
    end: '2026-10-24T00:00:00.000Z',
    reason: 'Holiday',
  } satisfies AddTimeOffRequest,
  bookLessonRequest: {
    studentId: ids.student,
    instructorMembershipId: ids.instructorMembership,
    lessonTypeId: ids.lessonType,
    vehicleId: ids.vehicle,
    start: '2026-10-12T07:00:00.000Z',
    pickupAddress: 'Friedrichstraße 100, 10117 Berlin',
    pickupLat: 52.52,
    pickupLng: 13.388,
  } satisfies BookLessonRequest,
  moveLessonRequest: {
    start: '2026-10-14T08:00:00.000Z',
    vehicleId: ids.vehicleAutomatic,
    version: 1,
  } satisfies MoveLessonRequest,
  cancelLessonRequest: { reason: 'Student is ill', version: 1 } satisfies CancelLessonRequest,
  cancelLessonResponse: {
    id: ids.lesson,
    version: 2,
    late: false,
    minutesRestored: 60,
  } satisfies CancelLessonResponse,
  progressInput,
  completeLessonRequest: {
    progress: [progressInput, { syllabusItemId: ids.secondSyllabusItem, level: 2, note: '' }],
    privateNote: 'Gets nervous at multi-lane roundabouts.',
    version: 1,
  } satisfies CompleteLessonRequest,
  markNoShowRequest: { version: 1 } satisfies MarkNoShowRequest,
  syncPullQuery: { cursor: '1041', limit: 200 } satisfies SyncPullQuery,
  syncStudent,
  syncProgressEntry,
  syncAvailability,
  syncEntity: 'lesson' satisfies SyncEntity,
  syncChange,
  syncPullResponse: {
    items: [
      syncChange,
      {
        seq: '1043',
        entityId: ids.student,
        at: '2026-10-08T09:31:00.000Z',
        op: 'upsert',
        entity: 'student',
        data: syncStudent,
      },
      {
        seq: '1044',
        entityId: ids.vehicle,
        at: '2026-10-08T09:32:00.000Z',
        op: 'upsert',
        entity: 'vehicle',
        data: schoolSamples.vehicle,
      },
      {
        seq: '1045',
        entityId: ids.progressEntry,
        at: '2026-10-08T09:33:00.000Z',
        op: 'upsert',
        entity: 'progress_entry',
        data: syncProgressEntry,
      },
      {
        seq: '1046',
        entityId: ids.instructorMembership,
        at: '2026-10-08T09:34:00.000Z',
        op: 'upsert',
        entity: 'availability',
        data: syncAvailability,
      },
      {
        seq: '1047',
        entityId: ids.secondStudent,
        at: '2026-10-08T09:35:00.000Z',
        op: 'revoke',
        entity: 'student',
        data: null,
      },
    ],
    nextCursor: '1047',
    hasMore: false,
  } satisfies SyncPullResponse,
  syncOp,
  syncPushRequest: {
    ops: [
      {
        opId: '0192f000-0106-7000-8000-000000000002',
        clientAt: '2026-10-12T06:30:00.000Z',
        baseVersion: null,
        type: 'lesson.create',
        payload: {
          lessonId: ids.secondLesson,
          studentId: ids.secondStudent,
          lessonTypeId: ids.lessonType,
          vehicleId: ids.vehicle,
          start: '2026-10-12T09:00:00.000Z',
        },
      },
      {
        opId: '0192f000-0106-7000-8000-000000000003',
        clientAt: '2026-10-12T06:31:00.000Z',
        baseVersion: 1,
        type: 'lesson.move',
        payload: { lessonId: ids.lesson, start: '2026-10-12T07:30:00.000Z' },
      },
      {
        opId: '0192f000-0106-7000-8000-000000000004',
        clientAt: '2026-10-12T06:32:00.000Z',
        baseVersion: 2,
        type: 'lesson.cancel',
        payload: { lessonId: ids.lesson, reason: 'Car broke down' },
      },
      syncOp,
      {
        opId: '0192f000-0106-7000-8000-000000000005',
        clientAt: '2026-10-12T08:10:00.000Z',
        baseVersion: 1,
        type: 'lesson.no_show',
        payload: { lessonId: ids.secondLesson },
      },
      {
        opId: '0192f000-0106-7000-8000-000000000006',
        clientAt: '2026-10-12T08:06:00.000Z',
        baseVersion: null,
        type: 'progress.upsert',
        payload: {
          progressEntryId: ids.progressEntry,
          lessonId: ids.lesson,
          syllabusItemId: ids.syllabusItem,
          level: 3,
          note: 'Mirror checks are routine.',
        },
      },
      {
        opId: '0192f000-0106-7000-8000-000000000007',
        clientAt: '2026-10-12T08:07:00.000Z',
        baseVersion: null,
        type: 'private_note.upsert',
        payload: { privateNoteId: ids.privateNote, lessonId: ids.lesson, body: 'Tired today.' },
      },
      {
        opId: '0192f000-0106-7000-8000-000000000008',
        clientAt: '2026-10-12T08:08:00.000Z',
        baseVersion: null,
        type: 'payment.cash',
        payload: {
          paymentId: ids.payment,
          studentId: ids.student,
          priceItemId: ids.priceItem,
          amountMinor: 6500,
          currency: 'EUR',
        },
      },
    ],
  } satisfies SyncPushRequest,
  syncOpResult,
  syncPushResponse: {
    results: [
      syncOpResult,
      {
        opId: '0192f000-0106-7000-8000-000000000003',
        status: 'rejected',
        id: ids.lesson,
        version: 3,
        error: { code: 'stale_version', message: 'The lesson changed on the server.' },
        serverState: { ...lesson, version: 3 },
      },
    ],
  } satisfies SyncPushResponse,
  preferredWindow,
  waitingListEntry,
  listWaitingListQuery: { active: 'true', limit: 50 } satisfies ListWaitingListQuery,
  waitingListResponse: {
    items: [waitingListEntry],
    nextCursor: null,
  } satisfies WaitingListResponse,
  joinWaitingListRequest: {
    studentId: ids.secondStudent,
    lessonTypeId: ids.lessonType,
    preferredWindows: [preferredWindow, { weekday: 4, start: '15:00', end: '19:00' }],
    area: 'Kreuzberg',
  } satisfies JoinWaitingListRequest,
  slotOffer,
  listSlotOffersQuery: { status: 'open', limit: 50 } satisfies ListSlotOffersQuery,
  slotOfferListResponse: { items: [slotOffer], nextCursor: null } satisfies SlotOfferListResponse,
  createSlotOfferRequest: {
    instructorMembershipId: ids.instructorMembership,
    vehicleId: ids.vehicle,
    lessonTypeId: ids.lessonType,
    start: '2026-10-14T14:00:00.000Z',
    studentIds: [ids.secondStudent],
  } satisfies CreateSlotOfferRequest,
  acceptSlotOfferRequest: { studentId: ids.secondStudent } satisfies AcceptSlotOfferRequest,
};
