import {
  type LessonResponse,
  type SyncChange,
  type SyncEntity,
  type SyncOp,
  type SyncOpResult,
  syncPullQuerySchema,
  type SyncPushRequest,
  type SyncStudent,
} from '../dto/index.js';
import {
  body,
  fail,
  inSchool,
  type MockContext,
  MockHttpError,
  type MockResolver,
  requireSchool,
} from './context.js';
import { bookLesson, lessonResolvers } from './lessons.js';
import type { MockMembership, MockStore, MockStudent } from './store.js';
import { StatusCodes } from 'http-status-codes';

interface Visible {
  key: string;
  entity: SyncEntity;
  entityId: string;
  audience: string | null;
  data: unknown;
}

const feedKey = (schoolId: string, audience: string | null, entity: SyncEntity, id: string) =>
  `${schoolId}|${audience ?? '*'}|${entity}|${id}`;

const assignedTo = (student: MockStudent, membershipId: string) =>
  student.status === 'active' &&
  student.instructors.some((instructor) => instructor.instructorMembershipId === membershipId);

function toSyncStudent(student: MockStudent, membershipId: string): SyncStudent {
  return {
    id: student.id,
    fullName: student.fullName,
    phone: student.phone,
    licenceClass: student.licenceClass,
    area: student.area,
    pickupAddress: student.pickupAddress,
    pickupLat: student.pickupLat,
    pickupLng: student.pickupLng,
    isPrimary: student.instructors.some(
      (instructor) => instructor.instructorMembershipId === membershipId && instructor.isPrimary,
    ),
  };
}

function canSee(store: MockStore, membershipId: string, lesson: LessonResponse): boolean {
  const student = store.students.get(lesson.studentId)?.value;
  return (
    lesson.instructorMembershipId === membershipId ||
    (student !== undefined && assignedTo(student, membershipId))
  );
}

function visibleTo(store: MockStore, schoolId: string, membershipId: string): Visible[] {
  const visible: Visible[] = [];
  const add = (entity: SyncEntity, entityId: string, audience: string | null, data: unknown) =>
    visible.push({
      key: feedKey(schoolId, audience, entity, entityId),
      entity,
      entityId,
      audience,
      data,
    });
  for (const { schoolId: owner, value } of store.vehicles.values()) {
    if (owner === schoolId && value.active) add('vehicle', value.id, null, value);
  }
  for (const { schoolId: owner, value } of store.students.values()) {
    if (owner === schoolId && assignedTo(value, membershipId)) {
      add('student', value.id, membershipId, toSyncStudent(value, membershipId));
    }
  }
  const lessons = [...store.lessons.values()]
    .filter(
      ({ schoolId: owner, value }) => owner === schoolId && canSee(store, membershipId, value),
    )
    .map(({ value }) => value)
    .sort((a, b) => a.start.localeCompare(b.start));
  for (const lesson of lessons) add('lesson', lesson.id, membershipId, lesson);
  return visible;
}

function refreshFeed(
  store: MockStore,
  schoolId: string,
  membershipId: string,
): Map<string, unknown> {
  const visible = visibleTo(store, schoolId, membershipId);
  const current = new Map(visible.map((item) => [item.key, item.data]));
  const append = (item: Omit<Visible, 'key' | 'data'>, op: 'upsert' | 'delete') =>
    store.changeFeed.push({
      seq: store.changeFeed.length + 1,
      schoolId,
      entity: item.entity,
      entityId: item.entityId,
      op,
      audienceMembershipId: item.audience,
      at: store.isoNow(),
    });
  for (const item of visible) {
    const fingerprint = JSON.stringify(item.data);
    if (store.feedState.get(item.key) === fingerprint) continue;
    store.feedState.set(item.key, fingerprint);
    append(item, 'upsert');
  }
  const mine = [feedKey(schoolId, null, 'vehicle', ''), `${schoolId}|${membershipId}|`];
  for (const key of [...store.feedState.keys()]) {
    if (current.has(key) || !mine.some((prefix) => key.startsWith(prefix))) continue;
    store.feedState.delete(key);
    const [, audience, entity, entityId] = key.split('|');
    append(
      {
        entity: entity as SyncEntity,
        entityId: entityId ?? '',
        audience: audience === '*' ? null : (audience ?? null),
      },
      'delete',
    );
  }
  return current;
}

const syncPull: MockResolver = (context) => {
  const { schoolId, membership } = requireSchool(context);
  const parsed = syncPullQuerySchema.safeParse(Object.fromEntries(context.url.searchParams));
  if (!parsed.success) {
    fail(StatusCodes.BAD_REQUEST, 'validation_error', 'The query is invalid.', parsed.error.issues);
  }
  const { cursor = '0', limit } = parsed.data;
  const current = refreshFeed(context.store, schoolId, membership.id);
  const rows = context.store.changeFeed.filter(
    (row) =>
      row.schoolId === schoolId &&
      (row.audienceMembershipId === null || row.audienceMembershipId === membership.id) &&
      row.seq > Number(cursor),
  );
  const page = rows.slice(0, limit);
  const items = page.map((row) => {
    const base = { seq: String(row.seq), entityId: row.entityId, at: row.at, entity: row.entity };
    const data =
      row.op === 'upsert'
        ? current.get(feedKey(schoolId, row.audienceMembershipId, row.entity, row.entityId))
        : undefined;
    return (
      data === undefined
        ? { ...base, op: row.op === 'upsert' ? 'delete' : row.op, data: null }
        : { ...base, op: 'upsert', data }
    ) as SyncChange;
  });
  return {
    body: {
      items,
      nextCursor: page.at(-1) ? String(page.at(-1)?.seq) : cursor,
      hasMore: rows.length > limit,
    },
  };
};

const applied = (op: SyncOp, id: string, version: number): SyncOpResult => ({
  opId: op.opId,
  status: 'applied',
  id,
  version,
  error: null,
  serverState: null,
});

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

function lessonCommand(
  context: MockContext,
  operationId: string,
  lessonId: string,
  request: object,
  op: SyncOp,
): SyncOpResult {
  const resolve = lessonResolvers[operationId];
  if (!resolve) throw new Error(`no resolver ${operationId}`);
  const reply = resolve({ ...context, params: { id: lessonId }, body: withoutUndefined(request) });
  const { id, version } = reply.body as { id: string; version: number };
  return applied(op, id, version);
}

function nextEntityVersion(store: MockStore, id: string): number {
  let count = 1;
  for (const { result } of store.syncOperations.values()) {
    if (result.status === 'applied' && result.id === id) count += 1;
  }
  return count;
}

const OFFICE_EDIT_SHIFT_MS = 30 * 60_000;

function simulateOfficeEdit(store: MockStore, op: SyncOp): void {
  if (
    op.type === 'lesson.create' ||
    !op.type.startsWith('lesson.') ||
    !('lessonId' in op.payload)
  ) {
    return;
  }
  const { lessonId } = op.payload;
  const record = store.lessons.get(lessonId);
  if (!record || !store.syncStaleLessons.delete(lessonId)) return;
  const shift = (iso: string) => new Date(Date.parse(iso) + OFFICE_EDIT_SHIFT_MS).toISOString();
  record.version += 1;
  record.value = {
    ...record.value,
    start: shift(record.value.start),
    end: shift(record.value.end),
    version: record.version,
  };
}

function runOp(context: MockContext, membership: MockMembership, op: SyncOp): SyncOpResult {
  const { store } = context;
  simulateOfficeEdit(store, op);
  switch (op.type) {
    case 'lesson.create': {
      const { lessonId, ...request } = op.payload;
      if (store.lessons.has(lessonId)) {
        fail(StatusCodes.CONFLICT, 'lesson_exists', 'A lesson with this id already exists.');
      }
      const lesson = bookLesson(
        context,
        withoutUndefined({ ...request, instructorMembershipId: membership.id }),
        { id: lessonId, bookedVia: 'sync' },
      );
      return applied(op, lesson.id, lesson.version);
    }
    case 'lesson.move': {
      const { lessonId, ...changes } = op.payload;
      return lessonCommand(
        context,
        'lessons.move',
        lessonId,
        { ...changes, version: op.baseVersion },
        op,
      );
    }
    case 'lesson.cancel':
      return lessonCommand(
        context,
        'lessons.cancel',
        op.payload.lessonId,
        { reason: op.payload.reason, version: op.baseVersion },
        op,
      );
    case 'lesson.complete':
      return lessonCommand(
        context,
        'lessons.complete',
        op.payload.lessonId,
        { version: op.baseVersion },
        op,
      );
    case 'lesson.no_show':
      return lessonCommand(
        context,
        'lessons.markNoShow',
        op.payload.lessonId,
        { version: op.baseVersion },
        op,
      );
    case 'progress.upsert':
    case 'private_note.upsert': {
      inSchool(store.lessons, op.payload.lessonId, membership.schoolId);
      const id =
        op.type === 'progress.upsert' ? op.payload.progressEntryId : op.payload.privateNoteId;
      return applied(op, id, nextEntityVersion(store, id));
    }
    case 'payment.cash':
      inSchool(store.students, op.payload.studentId, membership.schoolId);
      return applied(op, op.payload.paymentId, 1);
  }
}

function serverStateFor(
  store: MockStore,
  membership: MockMembership,
  op: SyncOp,
  error: MockHttpError,
): LessonResponse | null {
  if (!op.type.startsWith('lesson.') || error.code === 'forbidden' || error.code === 'not_found') {
    return null;
  }
  const clashId =
    op.type === 'lesson.create' && error.code === 'lesson_conflict'
      ? (error.details as { lessonId?: string } | undefined)?.lessonId
      : 'lessonId' in op.payload
        ? op.payload.lessonId
        : undefined;
  const lesson = clashId ? store.lessons.get(clashId) : undefined;
  if (!lesson || lesson.schoolId !== membership.schoolId) return null;
  return canSee(store, membership.id, lesson.value) ? structuredClone(lesson.value) : null;
}

function applyOp(context: MockContext, membership: MockMembership, op: SyncOp): SyncOpResult {
  const { store } = context;
  const stored = store.syncOperations.get(op.opId);
  if (stored) {
    if (stored.membershipId === membership.id) return structuredClone(stored.result);
    return {
      opId: op.opId,
      status: 'rejected',
      id: null,
      version: null,
      error: { code: 'op_id_reused', message: 'This op id was already used.' },
      serverState: null,
    };
  }
  let result: SyncOpResult;
  try {
    result = runOp(context, membership, op);
  } catch (error) {
    if (!(error instanceof MockHttpError) || error.status >= StatusCodes.INTERNAL_SERVER_ERROR) {
      throw error;
    }
    result = {
      opId: op.opId,
      status: 'rejected',
      id: null,
      version: null,
      error: { code: error.code, message: error.message },
      serverState: serverStateFor(store, membership, op, error),
    };
  }
  store.syncOperations.set(op.opId, { membershipId: membership.id, result });
  return structuredClone(result);
}

const syncPush: MockResolver = (context) => {
  const { membership } = requireSchool(context);
  const { ops } = body<SyncPushRequest>(context);
  return { body: { results: ops.map((op) => applyOp(context, membership, op)) } };
};

export const syncResolvers: Record<string, MockResolver> = {
  'sync.pull': syncPull,
  'sync.push': syncPush,
};
