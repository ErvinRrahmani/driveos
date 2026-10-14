import { ReviewModerated, ReviewSubmitted, StudentAnonymized } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newEvent } from '../../src/kernel/cqrs/index.js';
import { newId } from '../../src/kernel/db/columns.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { testAttempts } from '../../src/modules/training/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent } from '../identity/support.js';
import { expectEventAppended } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { createLogin } from '../training/support.js';

describe('school reviews', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    worker = await createWorkerTestHarness(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  async function studentLogin(tenant: TestTenant, fullName = 'Stella Student') {
    const login = await createLogin(tenants, tenant, ['student']);
    const studentId = await createStudent(tenants, tenant, {
      dateOfBirth: '2000-01-01',
      userId: login.userId,
    });
    await system.query(`update students set full_name = $2 where id = $1`, [studentId, fullName]);
    return { ...login, studentId };
  }

  async function practical(tenant: TestTenant, studentId: string, result: 'passed' | 'failed') {
    await tenants.asSchool(tenant, (tx) =>
      tx.insert(testAttempts).values({
        id: newId(),
        schoolId: tenant.schoolId,
        studentId,
        kind: 'practical',
        takenOn: '2026-09-01',
        result,
        notes: '',
      }),
    );
  }

  const reviewRow = async (id: string) =>
    (
      await system.query<{ status: string; moderated_by_user_id: string | null; version: number }>(
        `select status, moderated_by_user_id, version from school_reviews where id = $1`,
        [id],
      )
    ).rows[0];

  it('registers the review anonymizer in the worker', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain('school.review-anonymizer');
  });

  it('403 review_not_available until the student passed the practical test', async () => {
    const stella = await studentLogin(A);
    await practical(A, stella.studentId, 'failed');
    const res = await http.post('/v1/reviews').set(stella.headers).send({ rating: 5 });
    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(res.body.error.code).toBe('review_not_available');
  });

  it('404 when the caller has no student record', async () => {
    const res = await http.post('/v1/reviews').set(authHeaders(A)).send({ rating: 5 });
    expect(res.status).toBe(StatusCodes.NOT_FOUND);
    expect(res.body.error.code).toBe('not_found');
  });

  it('submits one review per student, then office lists and approves it', async () => {
    const stella = await studentLogin(A, '  Stella  Maria Student ');
    await practical(A, stella.studentId, 'passed');

    const created = await http
      .post('/v1/reviews')
      .set(stella.headers)
      .send({ rating: 4, text: '  Great instructors.  ' });
    expect(created.status).toBe(StatusCodes.CREATED);
    expect(created.body).toEqual({ id: expect.any(String), version: 1 });
    const reviewId = created.body.id as string;
    const submitted = await expectEventAppended(db, {
      type: ReviewSubmitted,
      aggregateId: reviewId,
    });
    expect(submitted.aggregateType).toBe('school_review');
    expect(submitted.aggregateVersion).toBe(1);
    expect(submitted.payload).toEqual({
      reviewId,
      studentId: stella.studentId,
      rating: 4,
      submittedAt: expect.any(String),
    });

    const again = await http.post('/v1/reviews').set(stella.headers).send({ rating: 1 });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(again.body.error.code).toBe('review_exists');

    const office = await createLogin(tenants, A, ['office']);
    const pending = await http.get('/v1/reviews?status=pending').set(office.headers);
    expect(pending.status).toBe(StatusCodes.OK);
    expect(pending.body.items).toContainEqual({
      id: reviewId,
      studentId: stella.studentId,
      displayName: 'Stella S.',
      rating: 4,
      text: 'Great instructors.',
      status: 'pending',
      submittedAt: expect.any(String),
      moderatedAt: null,
    });

    const approved = await http
      .patch(`/v1/reviews/${reviewId}`)
      .set(office.headers)
      .send({ status: 'approved' });
    expect(approved.status).toBe(StatusCodes.OK);
    expect(approved.body).toEqual({ id: reviewId, version: 2 });
    expect(await reviewRow(reviewId)).toEqual({
      status: 'approved',
      moderated_by_user_id: office.userId,
      version: 2,
    });
    const moderated = await expectEventAppended(db, {
      type: ReviewModerated,
      aggregateId: reviewId,
    });
    expect(moderated.aggregateVersion).toBe(2);
    expect(moderated.payload).toMatchObject({ reviewId, status: 'approved' });

    const list = await http.get('/v1/reviews?status=approved').set(office.headers);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(reviewId);
    const stillPending = await http.get('/v1/reviews?status=pending').set(office.headers);
    expect(stillPending.body.items.map((item: { id: string }) => item.id)).not.toContain(reviewId);
  });

  it('lists newest first with a cursor', async () => {
    const ids: string[] = [];
    for (const name of ['First One', 'Second Two', 'Third Three']) {
      const login = await studentLogin(A, name);
      await practical(A, login.studentId, 'passed');
      const res = await http.post('/v1/reviews').set(login.headers).send({ rating: 5 });
      expect(res.status).toBe(StatusCodes.CREATED);
      ids.push(res.body.id as string);
    }
    const first = await http.get('/v1/reviews?limit=2').set(authHeaders(A));
    expect(first.status).toBe(StatusCodes.OK);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual([ids[2], ids[1]]);
    expect(first.body.nextCursor).toBe(ids[1]);
    const next = await http
      .get(`/v1/reviews?limit=2&cursor=${first.body.nextCursor as string}`)
      .set(authHeaders(A));
    expect(next.body.items[0].id).toBe(ids[0]);
  });

  it("does not let school B see or moderate A's reviews", async () => {
    const stella = await studentLogin(A);
    await practical(A, stella.studentId, 'passed');
    const created = await http.post('/v1/reviews').set(stella.headers).send({ rating: 5 });
    const reviewId = created.body.id as string;

    const list = await http.get('/v1/reviews').set(authHeaders(B));
    expect(list.status).toBe(StatusCodes.OK);
    expect(list.body.items).toEqual([]);
    const patch = await http
      .patch(`/v1/reviews/${reviewId}`)
      .set(authHeaders(B))
      .send({ status: 'hidden' });
    expect(patch.status).toBe(StatusCodes.NOT_FOUND);
    expect((await reviewRow(reviewId))?.status).toBe('pending');
  });

  it('students cannot moderate and staff without a student record cannot submit', async () => {
    const stella = await studentLogin(A);
    expect((await http.get('/v1/reviews').set(stella.headers)).status).toBe(StatusCodes.FORBIDDEN);
    const instructor = await createLogin(tenants, A, ['instructor']);
    expect(
      (await http.post('/v1/reviews').set(instructor.headers).send({ rating: 5 })).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it('deletes the review when the student is anonymized (worker)', async () => {
    const stella = await studentLogin(A);
    await practical(A, stella.studentId, 'passed');
    const created = await http.post('/v1/reviews').set(stella.headers).send({ rating: 3 });
    expect(created.status).toBe(StatusCodes.CREATED);
    const other = await studentLogin(A);
    await practical(A, other.studentId, 'passed');
    const kept = await http.post('/v1/reviews').set(other.headers).send({ rating: 5 });

    const anonymize = () =>
      worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
        worker.publisher.append([
          newEvent(StudentAnonymized, {
            aggregateType: 'student',
            aggregateId: stella.studentId,
            aggregateVersion: 9,
            payload: {
              studentId: stella.studentId,
              userId: stella.userId,
              userAnonymized: false,
              anonymizedAt: new Date().toISOString(),
            },
          }),
        ]),
      );
    await anonymize();
    expect((await worker.drainWorker()).failed).toBe(0);

    expect(await reviewRow(created.body.id as string)).toBeUndefined();
    expect(await reviewRow(kept.body.id as string)).toBeDefined();

    await anonymize();
    expect((await worker.drainWorker()).failed).toBe(0);
  });
});
