import { randomUUID } from 'node:crypto';
import { StudentAnonymized } from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newEvent } from '../../src/kernel/cqrs/index.js';
import { SubscriberRegistry } from '../../src/kernel/subscribers/index.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

describe('documents.student-anonymized', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let worker: WorkerTestHarness;
  let school: SchoolFixture;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    worker = await createWorkerTestHarness(db);
    school = await createSchoolFixture(system);
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await system?.end();
    await db?.drop();
  });

  async function storedDocument(studentId: string): Promise<string> {
    const id = randomUUID();
    const storageKey = `${school.schoolId}/${id}`;
    await system.query(
      `insert into documents (id, school_id, owner_student_id, kind, storage_key, mime, size_bytes, uploaded_by, status)
       values ($1, $2, $3, 'eye_test', $4, 'application/pdf', 10, $5, 'ready')`,
      [id, school.schoolId, studentId, storageKey, school.ownerUserId],
    );
    worker.storage.objects.set(storageKey, { sizeBytes: 10, mime: 'application/pdf' });
    return storageKey;
  }

  async function contractOf(studentId: string): Promise<string> {
    const templateId = randomUUID();
    const contractId = randomUUID();
    await system.query(
      `insert into contract_templates (id, school_id, name, version, body, active)
       values ($1, $2, 'Contract', 1, 'Body', true)`,
      [templateId, school.schoolId],
    );
    await system.query(
      `insert into contracts (id, school_id, student_id, template_id, template_version, body_snapshot, requires_guardian, status)
       values ($1, $2, $3, $4, 1, 'Body', false, 'pending')`,
      [contractId, school.schoolId, studentId, templateId],
    );
    return contractId;
  }

  async function anonymize(studentId: string) {
    await worker.tenant.runInTenant({ schoolId: school.schoolId, userId: null }, () =>
      worker.publisher.append([
        newEvent(StudentAnonymized, {
          aggregateType: 'student',
          aggregateId: studentId,
          aggregateVersion: 9,
          payload: {
            studentId,
            userId: null,
            userAnonymized: false,
            anonymizedAt: new Date().toISOString(),
          },
        }),
      ]),
    );
  }

  it('is registered in the worker', () => {
    expect(worker.app.get(SubscriberRegistry).names()).toContain('documents.student-anonymized');
  });

  it("deletes the student's objects and document rows but keeps contracts and other students' documents", async () => {
    const [anonymized, other] = school.studentIds;
    const keys = [await storedDocument(anonymized), await storedDocument(anonymized)];
    const otherKey = await storedDocument(other);
    const contractId = await contractOf(anonymized);

    await anonymize(anonymized);
    const drained = await worker.drainWorker();
    expect(drained.failed).toBe(0);

    for (const key of keys) expect(worker.storage.objects.has(key)).toBe(false);
    expect(worker.storage.objects.has(otherKey)).toBe(true);
    const left = await system.query<{ owner_student_id: string }>(
      `select owner_student_id from documents where school_id = $1`,
      [school.schoolId],
    );
    expect(left.rows).toEqual([{ owner_student_id: other }]);
    const contracts = await system.query(`select id from contracts where id = $1`, [contractId]);
    expect(contracts.rowCount).toBe(1);

    await anonymize(anonymized);
    expect((await worker.drainWorker()).failed).toBe(0);
  });
});
