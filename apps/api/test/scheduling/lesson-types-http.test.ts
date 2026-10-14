import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { GetLessonTypeQuery, ListLessonTypesQuery } from '../../src/modules/scheduling/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { StatusCodes } from 'http-status-codes';

const standard = {
  name: 'Standard lesson',
  kind: 'lesson',
  licenceClass: 'B',
  minutes: 60,
  creditMinutes: 60,
  requiresVehicle: true,
  requiresEntitlement: null,
};

describe('lesson types', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  it('creates a lesson type with version 1 and lists it', async () => {
    const created = await http
      .post('/v1/lesson-types')
      .set(authHeaders(A))
      .send(standard)
      .expect(StatusCodes.CREATED);
    expect(created.body).toEqual({ id: expect.any(String), version: 1 });
    const list = await http.get('/v1/lesson-types').set(authHeaders(A)).expect(StatusCodes.OK);
    expect(list.body.items).toContainEqual({ id: created.body.id, ...standard, active: true });
    expect(list.body.nextCursor).toBeNull();
  });

  it('rejects an exam lesson type without the exam_car entitlement (D8)', async () => {
    const res = await http
      .post('/v1/lesson-types')
      .set(authHeaders(A))
      .send({ ...standard, name: 'Exam', kind: 'exam' })
      .expect(StatusCodes.BAD_REQUEST);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.issues[0].path).toEqual(['requiresEntitlement']);
  });

  it('accepts an exam lesson type with the exam_car entitlement', async () => {
    await http
      .post('/v1/lesson-types')
      .set(authHeaders(A))
      .send({ ...standard, name: 'Exam', kind: 'exam', requiresEntitlement: 'exam_car' })
      .expect(StatusCodes.CREATED);
  });

  it('patches, bumps the version and re-checks the exam rule on the merged type', async () => {
    const created = await http
      .post('/v1/lesson-types')
      .set(authHeaders(A))
      .send({ ...standard, name: 'Night drive', minutes: 45 })
      .expect(StatusCodes.CREATED);
    const patched = await http
      .patch(`/v1/lesson-types/${created.body.id}`)
      .set(authHeaders(A))
      .send({ creditMinutes: 75, active: false })
      .expect(StatusCodes.OK);
    expect(patched.body).toEqual({ id: created.body.id, version: 2 });
    await http
      .patch(`/v1/lesson-types/${created.body.id}`)
      .set(authHeaders(A))
      .send({ kind: 'exam' })
      .expect(StatusCodes.BAD_REQUEST);
    const type = await executeAs(kernel.app, A, new GetLessonTypeQuery(created.body.id));
    expect(type).toMatchObject({ creditMinutes: 75, active: false, kind: 'lesson' });
  });

  it('filters by active and pages by id', async () => {
    const inactive = await executeAs(
      kernel.app,
      A,
      new ListLessonTypesQuery({ active: 'false', limit: 50 }),
    );
    expect(inactive.items.every((type) => !type.active)).toBe(true);
    expect(inactive.items).toHaveLength(1);
    const first = await executeAs(kernel.app, A, new ListLessonTypesQuery({ limit: 1 }));
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe(first.items[0]?.id);
    const second = await executeAs(
      kernel.app,
      A,
      new ListLessonTypesQuery({ limit: 1, cursor: first.nextCursor ?? undefined }),
    );
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('answers 404 for an unknown or foreign lesson type', async () => {
    const created = await http
      .post('/v1/lesson-types')
      .set(authHeaders(A))
      .send(standard)
      .expect(StatusCodes.CREATED);
    await http
      .patch(`/v1/lesson-types/${created.body.id}`)
      .set(authHeaders(B))
      .send({ name: 'Hijack' })
      .expect(StatusCodes.NOT_FOUND);
    expect(await executeAs(kernel.app, B, new GetLessonTypeQuery(created.body.id))).toBeNull();
  });

  it('lets an instructor read but not create lesson types', async () => {
    const instructor = authHeadersFor(A, { roles: ['instructor'] });
    await http.get('/v1/lesson-types').set(instructor).expect(StatusCodes.OK);
    await http
      .post('/v1/lesson-types')
      .set(instructor)
      .send(standard)
      .expect(StatusCodes.FORBIDDEN);
  });
});
