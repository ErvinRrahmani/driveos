import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/kernel/db/database.service.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';

interface Settings extends Record<string, unknown> {
  school_id: string | null;
  user_id: string | null;
  role: string;
  pid: number;
  txid: string;
}

function one<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('expected a row');
  return row;
}

const readSettings = sql`select current_setting('app.school_id', true) as school_id,
  current_setting('app.user_id', true) as user_id, current_user as role,
  pg_backend_pid() as pid, txid_current()::text as txid`;

describe('TenantContext', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let schoolA: SchoolFixture;
  let schoolB: SchoolFixture;
  let database: DatabaseService;
  let tenant: TenantContext;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    schoolA = await createSchoolFixture(system);
    schoolB = await createSchoolFixture(system);
    database = new DatabaseService({ DATABASE_URL: db.appUrl, DATABASE_SYSTEM_URL: db.systemUrl });
    tenant = new TenantContext(database);
  }, 60_000);

  afterAll(async () => {
    await database?.close();
    await system?.end();
    await db?.drop();
  });

  const a = () => ({ schoolId: schoolA.schoolId, userId: schoolA.ownerUserId });

  it('runs the callback as app_rw with both settings set inside one transaction', async () => {
    const inside = await tenant.runInTenant(a(), async () => {
      const first = await tenant.tx.execute<Settings>(readSettings);
      const second = await tenant.tx.execute<Settings>(readSettings);
      return { first: one(first.rows), second: one(second.rows) };
    });
    expect(inside.first).toMatchObject({
      school_id: schoolA.schoolId,
      user_id: schoolA.ownerUserId,
      role: 'app_rw',
    });
    expect(inside.second.txid).toBe(inside.first.txid);
  });

  it('exposes schoolId and userId inside the scope', async () => {
    const seen = await tenant.runInTenant(a(), async () => ({
      schoolId: tenant.schoolId,
      userId: tenant.userId,
    }));
    expect(seen).toEqual(a());
  });

  it('leaves no settings on the pooled connection after the transaction', async () => {
    const inside = await tenant.runInTenant(a(), async () => {
      const result = await tenant.tx.execute<Settings>(readSettings);
      return one(result.rows);
    });
    const after = await database.app.execute<Settings>(readSettings);
    expect(one(after.rows).pid).toBe(inside.pid);
    expect(one(after.rows).school_id || null).toBeNull();
    expect(one(after.rows).user_id || null).toBeNull();
  });

  it('scopes tenant tables to the school in the settings', async () => {
    const ids = await tenant.runInTenant(a(), async () => {
      const result = await tenant.tx.execute<{ school_id: string }>(
        sql`select distinct school_id from branches`,
      );
      return result.rows.map((row) => row.school_id);
    });
    expect(ids).toEqual([schoolA.schoolId]);
  });

  it('sets an empty school id when there is none, so tenant tables return no rows', async () => {
    const result = await tenant.runInTenant(
      { schoolId: null, userId: schoolA.ownerUserId },
      async () => {
        const settings = await tenant.tx.execute<Settings>(readSettings);
        const branches = await tenant.tx.execute(sql`select id from branches`);
        return { settings: one(settings.rows), branches: branches.rows.length };
      },
    );
    expect(result.settings.school_id).toBe('');
    expect(result.settings.user_id).toBe(schoolA.ownerUserId);
    expect(result.branches).toBe(0);
  });

  it('commits when the callback succeeds', async () => {
    const id = randomUUID();
    await tenant.runInTenant(a(), () =>
      tenant.tx.execute(sql`insert into branches (id, school_id, name, address, lat, lng)
        values (${id}, ${schoolA.schoolId}, 'Committed', 'x', 0, 0)`),
    );
    const found = await system.query('select 1 from branches where id = $1', [id]);
    expect(found.rowCount).toBe(1);
  });

  it('rolls back and rethrows when the callback fails', async () => {
    const id = randomUUID();
    const failure = new Error('boom');
    await expect(
      tenant.runInTenant(a(), async () => {
        await tenant.tx.execute(sql`insert into branches (id, school_id, name, address, lat, lng)
          values (${id}, ${schoolA.schoolId}, 'Rolled back', 'x', 0, 0)`);
        throw failure;
      }),
    ).rejects.toBe(failure);
    const found = await system.query('select 1 from branches where id = $1', [id]);
    expect(found.rowCount).toBe(0);
  });

  it('joins the surrounding transaction when nested with the same tenant', async () => {
    const txids = await tenant.runInTenant(a(), async () => {
      const outer = await tenant.tx.execute<Settings>(readSettings);
      const inner = await tenant.runInTenant(a(), async () => {
        const result = await tenant.tx.execute<Settings>(readSettings);
        return one(result.rows).txid;
      });
      return [one(outer.rows).txid, inner];
    });
    expect(txids[1]).toBe(txids[0]);
  });

  it('refuses to nest a different tenant', async () => {
    await expect(
      tenant.runInTenant(a(), () =>
        tenant.runInTenant(
          { schoolId: schoolB.schoolId, userId: schoolB.ownerUserId },
          async () => 1,
        ),
      ),
    ).rejects.toThrow(/different tenant/);
  });

  describe('enterSchool', () => {
    const admin = () => ({ schoolId: null, userId: schoolA.ownerUserId });

    it('scopes a school-less request to one school inside the same transaction', async () => {
      const seen = await tenant.runInTenant(admin(), async () => {
        const before = one((await tenant.tx.execute<Settings>(readSettings)).rows);
        const inside = await tenant.enterSchool(schoolB.schoolId, async () => ({
          settings: one((await tenant.tx.execute<Settings>(readSettings)).rows),
          schoolId: tenant.schoolId,
          userId: tenant.userId,
          schools: (await tenant.tx.execute(sql`select id from schools`)).rows,
        }));
        const after = one((await tenant.tx.execute<Settings>(readSettings)).rows);
        return { before, inside, after, schoolAfter: tenant.schoolId };
      });
      expect(seen.inside.settings).toMatchObject({ school_id: schoolB.schoolId, role: 'app_rw' });
      expect(seen.inside.settings.txid).toBe(seen.before.txid);
      expect(seen.inside).toMatchObject({
        schoolId: schoolB.schoolId,
        userId: schoolA.ownerUserId,
        schools: [{ id: schoolB.schoolId }],
      });
      expect(seen.after.school_id).toBe('');
      expect(seen.schoolAfter).toBeNull();
    });

    it('restores the school-less settings when the callback fails', async () => {
      const after = await tenant.runInTenant(admin(), async () => {
        await expect(
          tenant.enterSchool(schoolB.schoolId, () => Promise.reject(new Error('boom'))),
        ).rejects.toThrow('boom');
        return one((await tenant.tx.execute<Settings>(readSettings)).rows).school_id;
      });
      expect(after).toBe('');
    });

    it('refuses to switch away from a school or to run outside a scope', async () => {
      await expect(
        tenant.runInTenant(a(), () => tenant.enterSchool(schoolB.schoolId, async () => 1)),
      ).rejects.toThrow(/without a school/);
      await expect(tenant.enterSchool(schoolB.schoolId, async () => 1)).rejects.toThrow(
        /outside a tenant scope/,
      );
    });
  });

  it('throws when tx, schoolId or userId is read outside a tenant scope', () => {
    expect(() => tenant.tx).toThrow(/outside a tenant scope/);
    expect(() => tenant.schoolId).toThrow(/outside a tenant scope/);
    expect(() => tenant.userId).toThrow(/outside a tenant scope/);
  });

  it('runAsSystem runs on the app_system pool and sees every school', async () => {
    const result = await tenant.runAsSystem(async (tx) => {
      const role = await tx.execute<{ role: string }>(sql`select current_user as role`);
      const schools = await tx.execute<{ id: string }>(
        sql`select id from schools where id in (${schoolA.schoolId}, ${schoolB.schoolId})`,
      );
      return { role: one(role.rows).role, schools: schools.rows.length };
    });
    expect(result).toEqual({ role: 'app_system', schools: 2 });
  });

  it('runAsSystem refuses to run inside a tenant scope', async () => {
    await expect(tenant.runInTenant(a(), () => tenant.runAsSystem(async () => 1))).rejects.toThrow(
      /inside a tenant scope/,
    );
  });
});
