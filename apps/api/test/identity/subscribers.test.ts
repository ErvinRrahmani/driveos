import { randomUUID } from 'node:crypto';
import { GuardianConsentGiven, MembershipPermissionsChanged } from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newEvent } from '../../src/kernel/cqrs/index.js';
import { RedisConnection } from '../../src/kernel/redis/redis-connection.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';
import { createUser, type MembershipStatus } from './support.js';

describe('identity subscribers', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let tenants: TestTenants;
  let A: TestTenant;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    tenants = await createTestTenants(db, { context: worker.tenant });
    A = tenants.A;
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  const membership = async (id: string) =>
    (
      await system.query<{ status: string; version: number }>(
        `select status, version from memberships where id = $1`,
        [id],
      )
    ).rows[0];

  async function consentGiven(tenant: TestTenant, studentUserId: string | null) {
    await worker.tenant.runInTenant({ schoolId: tenant.schoolId, userId: null }, () =>
      worker.publisher.append([
        newEvent(GuardianConsentGiven, {
          aggregateType: 'guardian_link',
          aggregateId: randomUUID(),
          aggregateVersion: 1,
          payload: {
            schoolId: tenant.schoolId,
            studentId: randomUUID(),
            guardianLinkId: randomUUID(),
            guardianUserId: randomUUID(),
            studentUserId,
            consentTextVersion: 'v1',
          },
        }),
      ]),
    );
  }

  async function studentWith(status: MembershipStatus, tenant = A) {
    const user = await createUser(tenants, {
      memberships: [{ tenant, roles: ['student'], status }],
    });
    return { userId: user.userId, membershipId: user.membershipIds[0] as string };
  }

  it('registers the identity subscribers in the worker', () => {
    const names = worker.app.get(SubscriberRegistry).names();
    expect(names).toEqual(
      expect.arrayContaining(['identity.guardian-consent', 'identity.permission-cache']),
    );
  });

  describe('GuardianConsentGiven', () => {
    it("activates the student's pending_consent membership and bumps its version", async () => {
      const student = await studentWith('pending_consent');

      await consentGiven(A, student.userId);
      const result = await worker.drainWorker();

      expect(result.failed).toBe(0);
      expect(await membership(student.membershipId)).toEqual({ status: 'active', version: 2 });
    });

    it('leaves disabled and active memberships alone, and ignores a student without a login', async () => {
      const disabled = await studentWith('disabled');
      const active = await studentWith('active');

      await consentGiven(A, disabled.userId);
      await consentGiven(A, active.userId);
      await consentGiven(A, null);
      expect((await worker.drainWorker()).failed).toBe(0);

      expect(await membership(disabled.membershipId)).toEqual({ status: 'disabled', version: 1 });
      expect(await membership(active.membershipId)).toEqual({ status: 'active', version: 1 });
    });

    it("only touches the event's school", async () => {
      const user = await createUser(tenants, {
        memberships: [
          { tenant: A, roles: ['student'], status: 'pending_consent' },
          { tenant: tenants.B, roles: ['student'], status: 'pending_consent' },
        ],
      });

      await consentGiven(tenants.B, user.userId);
      await worker.drainWorker();

      expect(await membership(user.membershipIds[0] as string)).toMatchObject({
        status: 'pending_consent',
      });
      expect(await membership(user.membershipIds[1] as string)).toMatchObject({ status: 'active' });
    });
  });

  describe('MembershipPermissionsChanged', () => {
    it('drops the cached grants of that membership only', async () => {
      const redis = worker.app.get(RedisConnection);
      const membershipId = randomUUID();
      const other = randomUUID();
      const key = (id: string) => `${redis.prefix}:perm:${A.schoolId}:${id}`;
      await redis.client.set(key(membershipId), '[]', 'EX', 300);
      await redis.client.set(key(other), '[]', 'EX', 300);

      await worker.tenant.runInTenant({ schoolId: A.schoolId, userId: null }, () =>
        worker.publisher.append([
          newEvent(MembershipPermissionsChanged, {
            aggregateType: 'membership',
            aggregateId: membershipId,
            aggregateVersion: 2,
            payload: {
              schoolId: A.schoolId,
              membershipId,
              userId: randomUUID(),
              roles: ['office'],
              grants: ['prices.manage'],
              branchIds: [],
            },
          }),
        ]),
      );
      expect((await worker.drainWorker()).failed).toBe(0);

      expect(await redis.client.get(key(membershipId))).toBeNull();
      expect(await redis.client.get(key(other))).toBe('[]');
    });
  });
});
