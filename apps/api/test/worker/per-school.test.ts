import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PerSchoolJobs } from '../../src/kernel/jobs/index.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

describe('per-school job runner', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let schools: [SchoolFixture, SchoolFixture, SchoolFixture];
  let suspended: SchoolFixture;
  let harness: WorkerTestHarness;
  let runner: PerSchoolJobs;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    schools = [
      await createSchoolFixture(system),
      await createSchoolFixture(system),
      await createSchoolFixture(system),
    ];
    suspended = await createSchoolFixture(system);
    await system.query(`update schools set status = 'suspended' where id = $1`, [
      suspended.schoolId,
    ]);
    await system.query(`update schools set status = 'onboarding' where id = $1`, [
      schools[2].schoolId,
    ]);
    harness = await createWorkerTestHarness(db);
    runner = harness.app.get(PerSchoolJobs);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await system?.end();
    await db?.drop();
  });

  it('runs each non-suspended school in its own app_rw transaction with app.school_id set', async () => {
    const seen: { schoolId: string; setting: string; role: string; branches: number }[] = [];

    const summary = await runner.runForEachSchool('test.visit', async (schoolId) => {
      const result = await harness.tenant.tx.execute<{
        setting: string;
        role: string;
        branches: number;
      }>(
        sql`select current_setting('app.school_id', true) as setting, current_user as role,
          (select count(*)::int from branches) as branches`,
      );
      const [row] = result.rows;
      if (!row) throw new Error('no settings row');
      seen.push({ schoolId, ...row });
    });

    const expected = schools.map((s) => s.schoolId).sort();
    expect(summary).toEqual({ name: 'test.visit', schools: 3, succeeded: 3, failed: [] });
    expect(seen.map((s) => s.schoolId).sort()).toEqual(expected);
    for (const row of seen) {
      expect(row).toEqual({
        schoolId: row.schoolId,
        setting: row.schoolId,
        role: 'app_rw',
        branches: 1,
      });
    }
  });

  it('isolates failures: a failing school rolls back and the others still run', async () => {
    const [failing] = schools;
    const succeeded: string[] = [];

    const summary = await runner.runForEachSchool('test.failure', async (schoolId) => {
      await harness.tenant.tx.execute(
        sql`update branches set name = 'touched' where school_id = ${schoolId}`,
      );
      if (schoolId === failing.schoolId) throw new Error('school job failed');
      succeeded.push(schoolId);
    });

    expect(summary.failed).toEqual([{ schoolId: failing.schoolId, error: 'school job failed' }]);
    expect(summary).toMatchObject({ schools: 3, succeeded: 2 });
    expect(succeeded).toHaveLength(2);
    const names = await system.query<{ school_id: string; name: string }>(
      'select school_id, name from branches where school_id = any($1)',
      [schools.map((s) => s.schoolId)],
    );
    for (const row of names.rows) {
      expect(row.name).toBe(row.school_id === failing.schoolId ? 'Main' : 'touched');
    }
  });

  it('refuses to start inside a tenant scope', async () => {
    await expect(
      harness.tenant.runInTenant({ schoolId: schools[0].schoolId, userId: null }, () =>
        runner.runForEachSchool('test.nested', async () => undefined),
      ),
    ).rejects.toThrow(/runAsSystem cannot be called inside a tenant scope/);
  });
});
