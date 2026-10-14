import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/kernel/db/database.service.js';
import { purgeIdempotencyKeys } from '../../src/kernel/idempotency/purge.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';

describe('purgeIdempotencyKeys', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let database: DatabaseService;
  let tenant: TenantContext;

  const now = new Date('2030-03-10T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  const insertKey = async (createdAt: Date) => {
    const key = randomUUID();
    await system.query(
      `insert into idempotency_keys (school_id, key, endpoint, request_hash, response_status,
        response_body, created_at) values ($1, $2, 'POST /v1/ping', 'h', 201, '{}', $3)`,
      [school.schoolId, key, createdAt],
    );
    return key;
  };

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    database = new DatabaseService({ DATABASE_URL: db.appUrl, DATABASE_SYSTEM_URL: db.systemUrl });
    tenant = new TenantContext(database);
  }, 60_000);

  afterAll(async () => {
    await database?.close();
    await system?.end();
    await db?.drop();
  });

  it('deletes keys older than 24 hours across schools and keeps newer ones', async () => {
    const other = await createSchoolFixture(system);
    const old = await insertKey(hoursAgo(25));
    const edge = await insertKey(hoursAgo(24));
    const recent = await insertKey(hoursAgo(23));
    await system.query(
      `insert into idempotency_keys (school_id, key, endpoint, request_hash, response_status,
        response_body, created_at) values ($1, 'other-old', 'POST /v1/ping', 'h', 201, '{}', $2)`,
      [other.schoolId, hoursAgo(48)],
    );

    const deleted = await purgeIdempotencyKeys(tenant, now);

    expect(deleted).toBe(2);
    const left = (await system.query<{ key: string }>('select key from idempotency_keys')).rows;
    expect(left.map((row) => row.key).sort()).toEqual([edge, recent].sort());
    expect(left.map((row) => row.key)).not.toContain(old);
  });

  it('refuses to run inside a tenant scope', async () => {
    await expect(
      tenant.runInTenant({ schoolId: school.schoolId, userId: school.ownerUserId }, () =>
        purgeIdempotencyKeys(tenant, now),
      ),
    ).rejects.toThrow(/runAsSystem cannot be called inside a tenant scope/);
  });
});
