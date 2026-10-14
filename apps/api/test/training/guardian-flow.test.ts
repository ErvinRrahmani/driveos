import { GuardianLinked, InvitationCreated, MembershipCreated } from '@driveos/shared';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../src/kernel/cqrs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { uniqueEmail } from '../identity/support.js';
import { expectEventAppended, expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { dateYearsAgo, studentBody } from './support.js';
import { StatusCodes } from 'http-status-codes';

describe('training worker: invitation → user link → guardian link → consent', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    worker = await createWorkerTestHarness(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    A = tenants.A;
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const studentRow = async (id: string) =>
    (
      await system.query<{ user_id: string | null; version: number }>(
        `select user_id, version from students where id = $1`,
        [id],
      )
    ).rows[0];

  const membershipStatus = async (userId: string) =>
    (
      await system.query<{ status: string }>(
        `select status from memberships where school_id = $1 and user_id = $2`,
        [A.schoolId, userId],
      )
    ).rows[0]?.status;

  const linksOf = async (studentId: string) =>
    (
      await system.query<{ id: string; guardian_user_id: string; consent_at: Date | null }>(
        `select id, guardian_user_id, consent_at from guardian_links where student_id = $1`,
        [studentId],
      )
    ).rows;

  it('registers the training subscriber in the worker', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain(
      'training.membership-student-link',
    );
  });

  it('links the student login and the guardian from identity events, and consent activates the minor', async () => {
    const created = await http
      .post('/v1/students')
      .set(authHeaders(A))
      .send(studentBody({ fullName: 'Mila Minor', dateOfBirth: dateYearsAgo(15) }))
      .expect(StatusCodes.CREATED);
    const studentId = created.body.id as string;

    const studentInvite = await http
      .post('/v1/invitations')
      .set(authHeaders(A))
      .send({ roles: ['student'], email: uniqueEmail(), studentId })
      .expect(StatusCodes.CREATED);
    const studentAccept = await http
      .post(`/v1/invitations/${studentInvite.body.acceptToken}/accept`)
      .send({ fullName: 'Mila Minor' })
      .expect(StatusCodes.OK);
    const studentUserId = studentAccept.body.userId as string;
    expect(studentAccept.body.status).toBe('pending_consent');

    expect((await worker.drainWorker()).failed).toBe(0);
    expect(await studentRow(studentId)).toEqual({ user_id: studentUserId, version: 2 });

    const parentEmail = uniqueEmail();
    const guardian = await http
      .post(`/v1/students/${studentId}/guardians`)
      .set(authHeaders(A))
      .send({ email: parentEmail })
      .expect(StatusCodes.CREATED);
    expect(guardian.body.pending).toBe(true);
    const invitation = await expectEventAppended(db, {
      type: InvitationCreated,
      aggregateId: guardian.body.id,
    });
    const parentAccept = await http
      .post(`/v1/invitations/${invitation.payload.acceptToken}/accept`)
      .send({ fullName: 'Paula Parent' })
      .expect(StatusCodes.OK);
    const parentUserId = parentAccept.body.userId as string;
    expect(await linksOf(studentId)).toEqual([]);

    expect((await worker.drainWorker()).failed).toBe(0);
    const [link] = await linksOf(studentId);
    expect(link).toMatchObject({ guardian_user_id: parentUserId, consent_at: null });
    const [linked] = await expectEvents(db, { type: GuardianLinked, aggregateId: studentId });
    expect(linked?.payload).toEqual({
      guardianLinkId: link?.id,
      studentId,
      guardianUserId: parentUserId,
      studentUserId,
      consentRequired: true,
    });

    const parentHeaders = authHeadersFor(A, {
      roles: ['parent'],
      membershipId: parentAccept.body.membershipId,
      userId: parentUserId,
    });
    await http
      .post(`/v1/guardians/${link?.id}/consent`)
      .set(parentHeaders)
      .send({ consentTextVersion: '2026-09' })
      .expect(StatusCodes.OK);
    expect(await membershipStatus(studentUserId)).toBe('pending_consent');
    expect((await worker.drainWorker()).failed).toBe(0);
    expect(await membershipStatus(studentUserId)).toBe('active');
  });

  it('is idempotent when the same membership event is handled twice', async () => {
    const created = await http
      .post('/v1/students')
      .set(authHeaders(A))
      .send(studentBody({ fullName: 'Ida Idempotent' }))
      .expect(StatusCodes.CREATED);
    const studentId = created.body.id as string;
    const invite = await http
      .post('/v1/invitations')
      .set(authHeaders(A))
      .send({ roles: ['student'], email: uniqueEmail(), studentId })
      .expect(StatusCodes.CREATED);
    const accepted = await http
      .post(`/v1/invitations/${invite.body.acceptToken}/accept`)
      .send({ fullName: 'Ida Idempotent' })
      .expect(StatusCodes.OK);
    const parentInvite = await http
      .post(`/v1/students/${studentId}/guardians`)
      .set(authHeaders(A))
      .send({ email: uniqueEmail() })
      .expect(StatusCodes.CREATED);
    const token = (
      await expectEventAppended(db, { type: InvitationCreated, aggregateId: parentInvite.body.id })
    ).payload.acceptToken;
    const parent = await http
      .post(`/v1/invitations/${token}/accept`)
      .send({ fullName: 'Pia Parent' })
      .expect(StatusCodes.OK);

    const events = [
      await expectEventAppended(db, {
        type: MembershipCreated,
        aggregateId: accepted.body.membershipId,
      }),
      await expectEventAppended(db, {
        type: MembershipCreated,
        aggregateId: parent.body.membershipId,
      }),
    ];
    const { handler: subscriber } = worker.app
      .get(SubscriberRegistry)
      .get('training.membership-student-link');
    for (let round = 0; round < 2; round += 1) {
      for (const event of events) {
        await worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
          subscriber.handle(event as DomainEvent, { subscriber: 'test', attempt: 1 }),
        );
      }
    }
    expect(await studentRow(studentId)).toEqual({
      user_id: accepted.body.userId,
      version: 3,
    });
    expect(await linksOf(studentId)).toHaveLength(1);
    expect(await expectEvents(db, { type: GuardianLinked, aggregateId: studentId })).toHaveLength(
      1,
    );
  });
});
