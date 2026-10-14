import { EntitlementGranted } from '@driveos/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueryBus } from '../../src/kernel/cqrs/index.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import {
  ConsumeEntitlementCommand,
  GetStudentEntitlementsQuery,
  GrantEntitlementCommand,
  HasEntitlementQuery,
  ReleaseEntitlementCommand,
} from '../../src/modules/billing/index.js';
import {
  GetStudentBookingProfileQuery,
  GetStudentByUserQuery,
  ListLinkedStudentIdsQuery,
} from '../../src/modules/training/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent } from '../identity/support.js';
import { expectEventAppended } from '../support/events.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createLesson, createPaymentRow } from './support.js';
import { StatusCodes } from 'http-status-codes';

describe('entitlements', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const run = <R>(message: Parameters<typeof executeAs<R>>[2], as: TestTenant = A) =>
    executeAs(kernel.app, as, message);
  const newStudent = () => createStudent(tenants, A, { dateOfBirth: '2000-01-01' });

  it('grants an entitlement and appends EntitlementGranted', async () => {
    const studentId = await newStudent();
    const paymentId = await createPaymentRow(tenants, A, studentId);
    const result = await run(
      new GrantEntitlementCommand({ studentId, kind: 'premium_theory', paymentId }),
    );
    expect(result.version).toBe(1);
    const event = await expectEventAppended(db, {
      type: EntitlementGranted,
      aggregateId: result.id,
    });
    expect(event.aggregateType).toBe('entitlement');
    expect(event.payload).toMatchObject({
      entitlementId: result.id,
      studentId,
      kind: 'premium_theory',
      paymentId,
    });
    expect(await run(new GetStudentEntitlementsQuery(studentId))).toEqual([
      {
        id: result.id,
        kind: 'premium_theory',
        paymentId,
        grantedAt: expect.any(String),
      },
    ]);
    expect(await run(new HasEntitlementQuery(studentId, 'premium_theory'))).toBe(true);
    expect(await run(new HasEntitlementQuery(studentId, 'exam_car'))).toBe(false);
  });

  it("refuses to grant to another school's student", async () => {
    const studentId = await newStudent();
    await expect(
      run(new GrantEntitlementCommand({ studentId, kind: 'exam_car' }), B),
    ).rejects.toMatchObject({ status: StatusCodes.NOT_FOUND });
  });

  it('consumes the oldest active entitlement for a lesson and releases it again', async () => {
    const studentId = await newStudent();
    const first = await run(new GrantEntitlementCommand({ studentId, kind: 'exam_car' }));
    const second = await run(new GrantEntitlementCommand({ studentId, kind: 'exam_car' }));
    const lessonId = await createLesson(tenants, A, studentId);

    const consumed = await run(
      new ConsumeEntitlementCommand({ studentId, kind: 'exam_car', lessonId }),
    );
    expect(consumed).toEqual({ entitlementId: first.id });
    expect((await run(new GetStudentEntitlementsQuery(studentId))).map((e) => e.id)).toEqual([
      second.id,
    ]);

    const row = await tenants.asSchool(A, (tx) =>
      tx.execute<{ consumed_by_lesson_id: string; version: number; consumed: boolean }>(
        sql`select consumed_by_lesson_id, version, consumed_at is not null as consumed
            from entitlements where id = ${first.id}`,
      ),
    );
    expect(row.rows[0]).toEqual({ consumed_by_lesson_id: lessonId, version: 2, consumed: true });

    await run(new ReleaseEntitlementCommand(lessonId));
    expect((await run(new GetStudentEntitlementsQuery(studentId))).map((e) => e.id)).toEqual([
      first.id,
      second.id,
    ]);
    await run(new ReleaseEntitlementCommand(lessonId));
  });

  it('answers 409 entitlement_missing when nothing is left to consume', async () => {
    const studentId = await newStudent();
    await run(new GrantEntitlementCommand({ studentId, kind: 'premium_theory' }));
    const lessonId = await createLesson(tenants, A, studentId);
    await expect(
      run(new ConsumeEntitlementCommand({ studentId, kind: 'exam_car', lessonId })),
    ).rejects.toMatchObject({ status: StatusCodes.CONFLICT, code: 'entitlement_missing' });
  });

  it('does not offer a revoked entitlement', async () => {
    const studentId = await newStudent();
    const granted = await run(new GrantEntitlementCommand({ studentId, kind: 'exam_car' }));
    await tenants.asSchool(A, (tx) =>
      tx.execute(sql`update entitlements set revoked_at = now() where id = ${granted.id}`),
    );
    expect(await run(new HasEntitlementQuery(studentId, 'exam_car'))).toBe(false);
    expect(await run(new GetStudentEntitlementsQuery(studentId))).toEqual([]);
  });

  it("does not see another school's entitlements", async () => {
    const studentId = await newStudent();
    await run(new GrantEntitlementCommand({ studentId, kind: 'exam_car' }));
    expect(await run(new HasEntitlementQuery(studentId, 'exam_car'), B)).toBe(false);
    expect(await run(new GetStudentEntitlementsQuery(studentId), B)).toEqual([]);
  });
});

describe("billing resolves students through training's public queries", () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  it.each([
    [
      'GetStudentByUserQuery',
      () => new GetStudentByUserQuery('00000000-0000-7000-8000-000000000001'),
      null,
    ],
    [
      'GetStudentBookingProfileQuery',
      () => new GetStudentBookingProfileQuery('00000000-0000-7000-8000-000000000001'),
      null,
    ],
    [
      'ListLinkedStudentIdsQuery',
      () => new ListLinkedStudentIdsQuery('00000000-0000-7000-8000-000000000001'),
      [],
    ],
  ])(
    '%s has a training handler (billing/infra/student-lookup.ts uses it)',
    async (_name, build, empty) => {
      const bus = kernel.app.get(QueryBus);
      const schoolId = '00000000-0000-7000-8000-0000000000aa';
      await expect(
        kernel.app
          .get(TenantContext)
          .runInTenant({ schoolId, userId: null }, () => bus.execute(build())),
      ).resolves.toEqual(empty);
    },
  );
});
