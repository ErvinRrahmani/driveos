import { randomUUID } from 'node:crypto';
import { count } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { StatusCodes } from 'http-status-codes';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outbox } from '../../src/kernel/schema.js';
import { ledgerEntries, payments, refunds } from '../../src/modules/billing/infra/schema.js';
import { contracts, documents } from '../../src/modules/documents/infra/schema.js';
import { invitations, membershipBranches } from '../../src/modules/identity/infra/schema.js';
import { conversationMembers } from '../../src/modules/messaging/infra/schema.js';
import { lessons, slotOffers, waitingList } from '../../src/modules/scheduling/infra/schema.js';
import { openingHours, vehicles } from '../../src/modules/school/infra/schema.js';
import {
  guardianLinks,
  privateNotes,
  progressEntries,
  studentInstructors,
  students,
} from '../../src/modules/training/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createTemplateRow } from '../documents/support.js';
import { createBranch, createStudent, createUser, uniqueEmail } from '../identity/support.js';
import { createConversationRow, createMessageRow } from '../messaging/support.js';
import {
  insertLesson,
  insertLessonType,
  insertVehicle,
  insertSlotOffer,
  insertWeekdayAvailability,
} from '../scheduling/support.js';
import {
  createCrossTenantApp,
  type CrossTenantApp,
  type FixtureContext,
} from '../support/cross-tenant.js';
import { authHeadersFor, type TestTenant } from '../support/tenants.js';
import { assignInstructor, createSyllabus } from '../training/support.js';

const REJECTED = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
  StatusCodes.UNPROCESSABLE_ENTITY,
];

interface World {
  tenant: TestTenant;
  instructor: string;
  instructorUserId: string;
  studentId: string;
  lessonTypeId: string;
  vehicleId: string;
  branchId: string;
  priceItemId: string;
  paymentId: string;
  lessonId: string;
  startedLessonId: string;
  templateId: string;
  syllabusItemId: string;
  parentUserId: string;
  officeMembershipId: string;
  conversationId: string;
  messageId: string;
  slotOfferId: string;
}

interface Case {
  route: string;
  field: string;
  tables: PgTable[];
  call: (A: World, B: World) => Promise<Response>;
  sync?: boolean;
}

const key = () => ({ 'Idempotency-Key': `foreign-${randomUUID()}` });

describe('cross-school foreign ids in write bodies', () => {
  let db: ScratchDatabase;
  let harness: CrossTenantApp;
  let ctx: FixtureContext;
  let A: World;
  let B: World;

  const as = (world: World) => ({ ...ctx.auth(world.tenant), ...key() });
  const asInstructor = (world: World) => ({
    ...authHeadersFor(world.tenant, {
      roles: ['instructor'],
      membershipId: world.instructor,
      userId: world.instructorUserId,
    }),
    ...key(),
  });

  async function buildWorld(tenant: TestTenant): Promise<World> {
    const { tenants } = ctx;
    const instructorUser = await createUser(tenants, {
      memberships: [{ tenant, roles: ['instructor'] }],
    });
    const instructor = instructorUser.membershipIds[0] as string;
    await insertWeekdayAvailability(tenants, tenant, instructor);
    const studentId = await createStudent(tenants, tenant, { dateOfBirth: '2000-01-01' });
    await assignInstructor(tenants, tenant, studentId, instructor);
    const lessonTypeId = await insertLessonType(tenants, tenant);
    const vehicleId = await insertVehicle(tenants, tenant, `F-${randomUUID().slice(0, 6)}`);
    const branchId = await createBranch(tenants, tenant);
    const auth = ctx.auth(tenant);
    const priceItem = await ctx.request.post('/v1/price-items').set(auth).send({
      name: 'Foreign id lesson',
      kind: 'lesson',
      creditMinutes: 60,
      amountMinor: 6500,
      currency: 'EUR',
      taxRateBp: 1900,
    });
    expect(priceItem.status).toBe(StatusCodes.CREATED);
    const priceItemId = priceItem.body.id as string;
    const payment = await ctx.request
      .post('/v1/payments/cash')
      .set({ ...auth, ...key() })
      .send({ studentId, priceItemId, method: 'cash', amountMinor: 6500, currency: 'EUR' });
    expect(payment.status).toBe(StatusCodes.CREATED);
    const lessonId = await insertLesson(tenants, tenant, {
      studentId,
      instructorMembershipId: instructor,
      lessonTypeId,
      start: '2030-01-08T09:00:00.000Z',
    });
    const startedLessonId = await insertLesson(tenants, tenant, {
      studentId,
      instructorMembershipId: instructor,
      lessonTypeId,
      start: new Date(Date.now() - 3_600_000).toISOString(),
    });
    const [syllabusItemId] = await createSyllabus(tenants, tenant, [
      `F${randomUUID().slice(0, 4)}`,
    ]);
    const parent = await createUser(tenants, { memberships: [{ tenant, roles: ['parent'] }] });
    const office = await createUser(tenants, { memberships: [{ tenant, roles: ['office'] }] });
    const conversationId = await createConversationRow(tenants, tenant, { studentId });
    const messageId = await createMessageRow(tenants, tenant, {
      conversationId,
      senderUserId: tenant.ownerUserId,
    });
    const slotOfferId = await insertSlotOffer(tenants, tenant, {
      instructorMembershipId: instructor,
      lessonTypeId,
      start: '2030-01-09T09:00:00.000Z',
      offeredToStudentIds: [studentId],
    });
    return {
      tenant,
      instructor,
      instructorUserId: instructorUser.userId,
      studentId,
      lessonTypeId,
      vehicleId,
      branchId,
      priceItemId,
      paymentId: payment.body.id as string,
      lessonId,
      startedLessonId,
      templateId: await createTemplateRow(tenants, tenant),
      syllabusItemId: syllabusItemId as string,
      parentUserId: parent.userId,
      officeMembershipId: office.membershipIds[0] as string,
      conversationId,
      messageId,
      slotOfferId,
    };
  }

  const booking = (a: World, overrides: Record<string, unknown>) => ({
    studentId: a.studentId,
    instructorMembershipId: a.instructor,
    lessonTypeId: a.lessonTypeId,
    vehicleId: a.vehicleId,
    start: '2030-01-08T12:00:00.000Z',
    pickupAddress: 'Torstr. 1',
    pickupLat: 52.53,
    pickupLng: 13.4,
    ...overrides,
  });

  const syncOp = (type: string, baseVersion: number | null, payload: Record<string, unknown>) => ({
    ops: [{ opId: randomUUID(), clientAt: new Date().toISOString(), type, baseVersion, payload }],
  });

  const post = (path: string, headers: Record<string, string>, body: unknown) =>
    ctx.request
      .post(path)
      .set(headers)
      .send(body as object);
  const patch = (path: string, headers: Record<string, string>, body: unknown) =>
    ctx.request
      .patch(path)
      .set(headers)
      .send(body as object);
  const put = (path: string, headers: Record<string, string>, body: unknown) =>
    ctx.request
      .put(path)
      .set(headers)
      .send(body as object);

  const cases: Case[] = [
    {
      route: 'POST /v1/checkout',
      field: 'priceItemId',
      tables: [payments],
      call: (a, b) =>
        post('/v1/checkout', as(a), { priceItemId: b.priceItemId, studentId: a.studentId }),
    },
    {
      route: 'POST /v1/checkout',
      field: 'studentId',
      tables: [payments],
      call: (a, b) =>
        post('/v1/checkout', as(a), { priceItemId: a.priceItemId, studentId: b.studentId }),
    },
    {
      route: 'POST /v1/payments/cash',
      field: 'studentId',
      tables: [payments, ledgerEntries],
      call: (a, b) =>
        post('/v1/payments/cash', as(a), {
          studentId: b.studentId,
          priceItemId: a.priceItemId,
          method: 'cash',
          amountMinor: 6500,
          currency: 'EUR',
        }),
    },
    {
      route: 'POST /v1/payments/cash',
      field: 'priceItemId',
      tables: [payments, ledgerEntries],
      call: (a, b) =>
        post('/v1/payments/cash', as(a), {
          studentId: a.studentId,
          priceItemId: b.priceItemId,
          method: 'cash',
          amountMinor: 6500,
          currency: 'EUR',
        }),
    },
    {
      route: 'POST /v1/refunds',
      field: 'paymentId',
      tables: [refunds, ledgerEntries],
      call: (a, b) =>
        post('/v1/refunds', as(a), {
          paymentId: b.paymentId,
          amountMinor: 100,
          currency: 'EUR',
          minutesRemoved: 0,
          reason: 'foreign id',
        }),
    },
    {
      route: 'POST /v1/ledger/adjustments',
      field: 'studentId',
      tables: [ledgerEntries],
      call: (a, b) =>
        post('/v1/ledger/adjustments', as(a), {
          studentId: b.studentId,
          minutes: 60,
          note: 'foreign id',
          reason: 'foreign id',
        }),
    },
    {
      route: 'POST /v1/ledger/adjustments',
      field: 'lessonId',
      tables: [ledgerEntries],
      call: (a, b) =>
        post('/v1/ledger/adjustments', as(a), {
          studentId: a.studentId,
          minutes: 60,
          note: 'foreign id',
          reason: 'foreign id',
          lessonId: b.lessonId,
        }),
    },
    {
      route: 'POST /v1/documents/upload-url',
      field: 'ownerStudentId',
      tables: [documents],
      call: (a, b) =>
        post('/v1/documents/upload-url', as(a), {
          kind: 'eye_test',
          mime: 'application/pdf',
          sizeBytes: 1024,
          ownerStudentId: b.studentId,
        }),
    },
    {
      route: 'POST /v1/contracts',
      field: 'studentId',
      tables: [contracts],
      call: (a, b) =>
        post('/v1/contracts', as(a), { studentId: b.studentId, templateId: a.templateId }),
    },
    {
      route: 'POST /v1/contracts',
      field: 'templateId',
      tables: [contracts],
      call: (a, b) =>
        post('/v1/contracts', as(a), { studentId: a.studentId, templateId: b.templateId }),
    },
    {
      route: 'POST /v1/invitations',
      field: 'studentId',
      tables: [invitations],
      call: (a, b) =>
        post('/v1/invitations', as(a), {
          roles: ['student'],
          email: uniqueEmail(),
          studentId: b.studentId,
        }),
    },
    {
      route: 'POST /v1/invitations',
      field: 'branchIds',
      tables: [invitations],
      call: (a, b) =>
        post('/v1/invitations', as(a), {
          roles: ['office'],
          email: uniqueEmail(),
          branchIds: [b.branchId],
        }),
    },
    {
      route: 'PATCH /v1/memberships/:id',
      field: 'branchIds',
      tables: [membershipBranches],
      call: (a, b) =>
        patch(`/v1/memberships/${a.officeMembershipId}`, as(a), { branchIds: [b.branchId] }),
    },
    {
      route: 'POST /v1/conversations/:id/read',
      field: 'lastReadMessageId',
      tables: [conversationMembers],
      call: (a, b) =>
        post(`/v1/conversations/${a.conversationId}/read`, as(a), {
          lastReadMessageId: b.messageId,
        }),
    },
    ...(['studentId', 'instructorMembershipId', 'lessonTypeId', 'vehicleId'] as const).map(
      (field): Case => ({
        route: 'POST /v1/lessons',
        field,
        tables: [lessons, ledgerEntries],
        call: (a, b) => post('/v1/lessons', as(a), booking(a, { [field]: foreignValue(field, b) })),
      }),
    ),
    ...(['instructorMembershipId', 'lessonTypeId', 'vehicleId'] as const).map((field): Case => ({
      route: 'PATCH /v1/lessons/:id',
      field,
      tables: [lessons, ledgerEntries],
      call: (a, b) =>
        patch(`/v1/lessons/${a.lessonId}`, as(a), {
          start: '2030-01-08T13:00:00.000Z',
          [field]: foreignValue(field, b),
        }),
    })),
    {
      route: 'POST /v1/lessons/:id/complete',
      field: 'progress[].syllabusItemId',
      tables: [lessons, progressEntries],
      call: (a, b) =>
        post(`/v1/lessons/${a.startedLessonId}/complete`, as(a), {
          progress: [{ syllabusItemId: b.syllabusItemId, level: 2, note: '' }],
        }),
    },
    ...(['studentId', 'lessonTypeId', 'vehicleId'] as const).map((field): Case => ({
      route: 'POST /v1/sync lesson.create',
      field,
      tables: [lessons, ledgerEntries],
      sync: true,
      call: (a, b) =>
        post(
          '/v1/sync',
          asInstructor(a),
          syncOp('lesson.create', null, {
            lessonId: randomUUID(),
            studentId: a.studentId,
            lessonTypeId: a.lessonTypeId,
            vehicleId: null,
            start: '2030-01-08T14:00:00.000Z',
            pickupAddress: 'Torstr. 1',
            pickupLat: 52.53,
            pickupLng: 13.4,
            [field]: foreignValue(field, b),
          }),
        ),
    })),
    ...(['lessonTypeId', 'vehicleId'] as const).map((field): Case => ({
      route: 'POST /v1/sync lesson.move',
      field,
      tables: [lessons, ledgerEntries],
      sync: true,
      call: (a, b) =>
        post(
          '/v1/sync',
          asInstructor(a),
          syncOp('lesson.move', 1, {
            lessonId: a.lessonId,
            start: '2030-01-08T15:00:00.000Z',
            [field]: foreignValue(field, b),
          }),
        ),
    })),
    {
      route: 'POST /v1/sync progress.upsert',
      field: 'syllabusItemId',
      tables: [progressEntries],
      sync: true,
      call: (a, b) =>
        post(
          '/v1/sync',
          asInstructor(a),
          syncOp('progress.upsert', null, {
            progressEntryId: randomUUID(),
            lessonId: a.startedLessonId,
            syllabusItemId: b.syllabusItemId,
            level: 2,
            note: '',
          }),
        ),
    },
    {
      route: 'POST /v1/sync private_note.upsert',
      field: 'lessonId',
      tables: [privateNotes],
      sync: true,
      call: (a, b) =>
        post(
          '/v1/sync',
          asInstructor(a),
          syncOp('private_note.upsert', null, {
            privateNoteId: randomUUID(),
            lessonId: b.startedLessonId,
            body: 'foreign id',
          }),
        ),
    },
    ...(['studentId', 'priceItemId'] as const).map((field): Case => ({
      route: 'POST /v1/sync payment.cash',
      field,
      tables: [payments, ledgerEntries],
      sync: true,
      call: (a, b) =>
        post(
          '/v1/sync',
          asInstructor(a),
          syncOp('payment.cash', null, {
            paymentId: randomUUID(),
            studentId: a.studentId,
            priceItemId: a.priceItemId,
            amountMinor: 6500,
            currency: 'EUR',
            [field]: foreignValue(field, b),
          }),
        ),
    })),
    ...(['studentId', 'lessonTypeId'] as const).map((field): Case => ({
      route: 'POST /v1/waiting-list',
      field,
      tables: [waitingList],
      call: (a, b) =>
        post('/v1/waiting-list', as(a), {
          studentId: a.studentId,
          lessonTypeId: a.lessonTypeId,
          preferredWindows: [{ weekday: 2, start: '08:00', end: '18:00' }],
          area: 'Mitte',
          [field]: foreignValue(field, b),
        }),
    })),
    ...(['instructorMembershipId', 'lessonTypeId', 'vehicleId', 'studentIds'] as const).map(
      (field): Case => ({
        route: 'POST /v1/slot-offers',
        field,
        tables: [slotOffers],
        call: (a, b) =>
          post('/v1/slot-offers', as(a), {
            instructorMembershipId: a.instructor,
            lessonTypeId: a.lessonTypeId,
            vehicleId: a.vehicleId,
            start: '2030-01-08T13:00:00.000Z',
            studentIds: [a.studentId],
            [field]: field === 'studentIds' ? [b.studentId] : foreignValue(field, b),
          }),
      }),
    ),
    {
      route: 'POST /v1/slot-offers/:id/accept',
      field: 'studentId',
      tables: [lessons, slotOffers, ledgerEntries],
      call: (a, b) =>
        post(`/v1/slot-offers/${a.slotOfferId}/accept`, as(a), { studentId: b.studentId }),
    },
    {
      route: 'PUT /v1/school/opening-hours',
      field: 'items[].branchId',
      tables: [openingHours],
      call: (a, b) =>
        put('/v1/school/opening-hours', as(a), {
          items: [{ branchId: b.branchId, weekday: 2, opens: '08:00', closes: '12:00' }],
        }),
    },
    {
      route: 'POST /v1/vehicles',
      field: 'branchId',
      tables: [vehicles],
      call: (a, b) =>
        post('/v1/vehicles', as(a), {
          branchId: b.branchId,
          plate: `F-${randomUUID().slice(0, 6)}`,
          makeModel: 'VW Polo',
          transmission: 'manual',
          licenceClass: 'B',
        }),
    },
    {
      route: 'PATCH /v1/vehicles/:id',
      field: 'branchId',
      tables: [vehicles],
      call: (a, b) => patch(`/v1/vehicles/${a.vehicleId}`, as(a), { branchId: b.branchId }),
    },
    {
      route: 'POST /v1/students',
      field: 'primaryInstructorMembershipId',
      tables: [students, studentInstructors],
      call: (a, b) =>
        post('/v1/students', as(a), {
          fullName: 'Foreign Id',
          dateOfBirth: '2000-01-01',
          licenceClass: 'B',
          examLanguage: 'en',
          primaryInstructorMembershipId: b.instructor,
        }),
    },
    {
      route: 'PUT /v1/students/:id/instructors',
      field: 'instructors[].instructorMembershipId',
      tables: [studentInstructors],
      call: (a, b) =>
        put(`/v1/students/${a.studentId}/instructors`, as(a), {
          instructors: [{ instructorMembershipId: b.instructor, isPrimary: true }],
        }),
    },
    {
      route: 'POST /v1/students/:id/guardians',
      field: 'guardianUserId',
      tables: [guardianLinks],
      call: (a, b) =>
        post(`/v1/students/${a.studentId}/guardians`, as(a), { guardianUserId: b.parentUserId }),
    },
    {
      route: 'PUT /v1/students/:id/private-notes/:lessonId',
      field: ':lessonId',
      tables: [privateNotes],
      call: (a, b) =>
        put(`/v1/students/${a.studentId}/private-notes/${b.startedLessonId}`, as(a), {
          body: 'foreign id',
        }),
    },
  ];

  function foreignValue(field: string, b: World): string {
    switch (field) {
      case 'studentId':
        return b.studentId;
      case 'instructorMembershipId':
        return b.instructor;
      case 'lessonTypeId':
        return b.lessonTypeId;
      case 'vehicleId':
        return b.vehicleId;
      case 'priceItemId':
        return b.priceItemId;
      default:
        throw new Error(`No foreign value for ${field}`);
    }
  }

  async function snapshot(tables: PgTable[]) {
    return ctx.tenants.asSystem(async (tx) => {
      const rows = [];
      for (const table of tables) {
        const all = await tx.select().from(table);
        rows.push(all.map((row) => JSON.stringify(row)).sort());
      }
      const [events] = await tx.select({ n: count() }).from(outbox);
      return { rows: JSON.stringify(rows), events: events?.n };
    });
  }

  beforeAll(async () => {
    db = await createScratchDatabase();
    harness = await createCrossTenantApp(db);
    ctx = harness.context;
    A = await buildWorld(ctx.A);
    B = await buildWorld(ctx.B);
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
    await db?.drop();
  });

  it.each(cases.map((c) => [`${c.route} with B's ${c.field}`, c] as const))(
    '%s is rejected and writes nothing',
    async (_name, c) => {
      const before = await snapshot(c.tables);
      const res = await c.call(A, B);
      if (c.sync) {
        expect(res.status).toBe(StatusCodes.OK);
        const [result] = (res.body as { results: { status: string; error: { code: string } }[] })
          .results;
        expect(result?.status).toBe('rejected');
        expect(['not_found', 'validation_error']).toContain(result?.error.code);
      } else {
        expect(REJECTED, JSON.stringify(res.body)).toContain(res.status);
        if (res.status === StatusCodes.BAD_REQUEST) {
          expect(res.body.error.code).toBe('validation_error');
        }
      }
      expect(await snapshot(c.tables)).toEqual(before);
    },
  );
});
