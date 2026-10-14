import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { LeadPurgeJob } from '../../src/modules/training/infra/lead-purge.job.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-14T03:15:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe('training lead purge job', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let school: SchoolFixture;
  let other: SchoolFixture;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    school = await createSchoolFixture(system);
    other = await createSchoolFixture(system);
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  async function insertLead(
    schoolId: string,
    status: 'new' | 'contacted' | 'converted' | 'lost',
    createdAt: Date,
    lostAt: Date | null = null,
  ): Promise<string> {
    const id = newId();
    await system.query(
      `insert into leads (id, school_id, status, source, full_name, phone, licence_class, is_minor,
                          consent_text_version, consented_at, request_ip_hash, lost_at,
                          created_at, updated_at)
       values ($1, $2, $3, 'page', 'Purge Lead', $4, 'B', false, 'lead-consent.v1', $5, 'abc123', $6,
               $5, $5)`,
      [id, schoolId, status, `+49155${Math.floor(Math.random() * 1e8)}`, createdAt, lostAt],
    );
    return id;
  }

  it('registers training.lead-purge at 03:15 UTC daily', () => {
    const job = worker.app
      .get(ScheduledJobs)
      .list()
      .find((entry) => entry.name === 'training.lead-purge');
    expect(job).toMatchObject({ pattern: '15 3 * * *' });
  });

  it('deletes closed leads after 12 months and drops the IP hash after 30 days', async () => {
    const lostOld = await insertLead(school.schoolId, 'lost', daysAgo(400));
    const convertedOld = await insertLead(school.schoolId, 'converted', daysAgo(400));
    const newOld = await insertLead(school.schoolId, 'new', daysAgo(400));
    const lostRecent = await insertLead(school.schoolId, 'lost', daysAgo(40));
    const closedLately = await insertLead(school.schoolId, 'lost', daysAgo(400), daysAgo(10));
    const fresh = await insertLead(school.schoolId, 'new', daysAgo(5));
    const otherLostOld = await insertLead(other.schoolId, 'lost', daysAgo(400));

    const summary = await worker.app.get(LeadPurgeJob).purge(NOW);
    expect(summary.failed).toEqual([]);

    const left = await system.query<{ id: string; request_ip_hash: string | null }>(
      `select id, request_ip_hash from leads where id = any($1::uuid[])`,
      [[lostOld, convertedOld, newOld, lostRecent, closedLately, fresh, otherLostOld]],
    );
    const byId = new Map(left.rows.map((row) => [row.id, row.request_ip_hash]));
    // Kept 12 months after closing: a lead lost 10 days ago stays even when created long before.
    expect([...byId.keys()].sort()).toEqual([newOld, lostRecent, closedLately, fresh].sort());
    expect(byId.get(newOld)).toBeNull();
    expect(byId.get(lostRecent)).toBeNull();
    expect(byId.get(fresh)).toBe('abc123');
  });

  it('is a no-op on a second run', async () => {
    const id = await insertLead(school.schoolId, 'contacted', daysAgo(2));
    await worker.app.get(LeadPurgeJob).purge(NOW);
    const summary = await worker.app.get(LeadPurgeJob).purge(NOW);
    expect(summary.failed).toEqual([]);
    const row = await system.query(`select request_ip_hash from leads where id = $1`, [id]);
    expect(row.rows).toEqual([{ request_ip_hash: 'abc123' }]);
  });
});
