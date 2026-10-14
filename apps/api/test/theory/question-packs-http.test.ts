import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionPackPublished } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { students } from '../../src/modules/training/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended, expectNoEvent } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { createLogin } from '../training/support.js';

const PACKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packs');

type PackBody = Record<string, unknown> & { questions: Record<string, unknown>[] };

async function samplePack(overrides: Record<string, unknown> = {}): Promise<PackBody> {
  const raw = JSON.parse(await readFile(path.join(PACKS_DIR, 'sample-B-en.json'), 'utf8'));
  return { ...raw, country: 'DE', ...overrides } as PackBody;
}

describe('question packs (import, publish, current)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let admin: Record<string, string>;
  let student: Record<string, string>;
  let germanStudent: Record<string, string>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A } = tenants);
    http = request(kernel.app.getHttpServer());
    const adminId = randomUUID();
    await system.query(
      `insert into users (id, full_name, email, locale) values ($1, 'Petra Platform', $2, 'en')`,
      [adminId, `petra.${adminId}@example.com`],
    );
    await system.query(`insert into platform_admins (user_id) values ($1)`, [adminId]);
    admin = authHeadersFor(null, { userId: adminId, roles: ['platform_admin'] });

    const enrol = async (examLanguage: string) => {
      const login = await createLogin(tenants, A, ['student']);
      await tenants.asSchool(A, (tx) =>
        tx.insert(students).values({
          id: randomUUID(),
          schoolId: A.schoolId,
          userId: login.userId,
          dateOfBirth: '2000-01-01',
          licenceClass: 'B',
          examLanguage,
          status: 'active',
        }),
      );
      return login.headers;
    };
    student = await enrol('en');
    germanStudent = await enrol('de');
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const importPack = (body: object) =>
    http.post('/v1/platform/question-packs/import').set(admin).send(body);
  const publish = (id: string) =>
    http.post(`/v1/platform/question-packs/${id}/publish`).set(admin).send();

  describe('POST /v1/platform/question-packs/import', () => {
    it('stores the pack as a draft with its questions', async () => {
      const res = await importPack(await samplePack({ version: '2025.1' }));
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({ id: expect.any(String), version: 202501, questionCount: 12 });
      const pack = await system.query(
        `select country_code, licence_class, language, version, status, published_at,
                exam_rules->>'rules' as rules
           from question_packs where id = $1`,
        [res.body.id],
      );
      expect(pack.rows).toEqual([
        {
          country_code: 'DE',
          licence_class: 'B',
          language: 'en',
          version: 202501,
          status: 'draft',
          published_at: null,
          rules: 'fraction',
        },
      ]);
      const questions = await system.query(
        `select external_ref, body, media_key, correct, instant_fail from questions
          where pack_id = $1 order by external_ref limit 1`,
        [res.body.id],
      );
      expect(questions.rows).toEqual([
        {
          external_ref: 'SAMPLE-1.01',
          body: 'SAMPLE: What does a red octagonal sign usually mean?',
          media_key: null,
          correct: [1],
          instant_fail: false,
        },
      ]);
    });

    it('keeps instant-fail flags and media keys of an error_points pack', async () => {
      const raw = JSON.parse(
        await readFile(path.join(PACKS_DIR, 'sample-error-points-B-en.json'), 'utf8'),
      );
      const res = await importPack({ ...raw, version: '2025.3' });
      expect(res.status).toBe(StatusCodes.CREATED);
      const { rows } = await system.query(
        `select external_ref, media_key from questions
          where pack_id = $1 and (instant_fail or media_key is not null) order by external_ref`,
        [res.body.id],
      );
      expect(rows).toEqual([
        { external_ref: 'SAMPLE-EP-1.02', media_key: 'sample/warning-signs.png' },
        { external_ref: 'SAMPLE-EP-2.01', media_key: null },
      ]);
    });

    it('rejects a second import of the same country, class, language and version', async () => {
      const body = await samplePack({ version: '2025.2' });
      expect((await importPack(body)).status).toBe(StatusCodes.CREATED);
      const res = await importPack(body);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('question_pack_exists');
    });

    it('rejects a pack whose exam rules or answers do not fit its questions', async () => {
      const body = await samplePack({ version: '2025.4' });
      body.questions[0] = { ...body.questions[0], correct: [7] };
      const res = await importPack(body);
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
      expect(res.body.error.details.issues).toEqual([
        { path: ['questions', 0, 'correct'], message: expect.any(String) },
      ]);
    });

    it('is forbidden to school staff', async () => {
      const res = await http
        .post('/v1/platform/question-packs/import')
        .set(authHeaders(A))
        .send(await samplePack({ version: '2025.5' }));
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('POST /v1/platform/question-packs/{id}/publish', () => {
    it('publishes a draft and appends QuestionPackPublished without a school', async () => {
      const imported = await importPack(await samplePack({ version: '2025.6' }));
      const res = await publish(imported.body.id);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ id: imported.body.id, version: 2 });
      const event = await expectEventAppended(
        db,
        { type: QuestionPackPublished, aggregateId: imported.body.id },
        { count: 1 },
      );
      expect(event).toMatchObject({
        schoolId: null,
        aggregateType: 'question_pack',
        aggregateVersion: 2,
        payload: {
          packId: imported.body.id,
          countryCode: 'DE',
          licenceClass: 'B',
          language: 'en',
          packVersion: 202506,
          questionCount: 12,
        },
      });
      const { rows } = await system.query(
        `select status, published_at from question_packs where id = $1`,
        [imported.body.id],
      );
      expect(rows[0].status).toBe('published');
      expect(rows[0].published_at).toBeInstanceOf(Date);
    });

    it('refuses to publish a pack twice', async () => {
      const imported = await importPack(await samplePack({ version: '2025.7' }));
      expect((await publish(imported.body.id)).status).toBe(StatusCodes.OK);
      const res = await publish(imported.body.id);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('question_pack_already_published');
      await expectEventAppended(
        db,
        { type: QuestionPackPublished, aggregateId: imported.body.id },
        { count: 1 },
      );
    });

    it('answers 404 for an unknown pack and 403 to school staff', async () => {
      expect((await publish(randomUUID())).status).toBe(StatusCodes.NOT_FOUND);
      const imported = await importPack(await samplePack({ version: '2025.8' }));
      const res = await http
        .post(`/v1/platform/question-packs/${imported.body.id}/publish`)
        .set(authHeaders(A))
        .send();
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
      await expectNoEvent(db, { type: QuestionPackPublished, aggregateId: imported.body.id });
    });
  });

  describe('GET /v1/question-packs/current', () => {
    const current = (headers: Record<string, string>, query: Record<string, string> = {}) =>
      http.get('/v1/question-packs/current').set(headers).query(query);

    it("serves the latest published pack for the student's class, language and country", async () => {
      const older = await importPack(await samplePack({ version: '2026.1' }));
      await publish(older.body.id);
      const newer = await importPack(await samplePack({ version: '2026.2' }));
      const draft = await importPack(await samplePack({ version: '2026.3' }));
      const otherClass = await importPack(
        await samplePack({ version: '2026.4', licenceClass: 'A' }),
      );
      const otherCountry = await importPack(await samplePack({ version: '2026.5', country: 'PT' }));
      for (const id of [newer.body.id, otherClass.body.id, otherCountry.body.id]) await publish(id);
      expect(draft.status).toBe(StatusCodes.CREATED);

      const res = await current(student);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toEqual({
        id: newer.body.id,
        countryCode: 'DE',
        licenceClass: 'B',
        language: 'en',
        version: 202602,
        questionCount: 12,
        categories: ['rules', 'safety', 'signs'],
        exam: {
          rules: 'fraction',
          questions: 10,
          timeLimitMinutes: 15,
          passMark: 0.8,
          categories: { signs: 3, rules: 5, safety: 2 },
        },
        publishedAt: expect.any(String),
      });
    });

    it('answers 404 question_pack_missing when no pack is published for the exam language', async () => {
      const res = await current(germanStudent);
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(res.body.error.code).toBe('question_pack_missing');
    });

    it('lets the query choose the class and language', async () => {
      const res = await current(germanStudent, { language: 'en', licenceClass: 'A' });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({ licenceClass: 'A', language: 'en', version: 202604 });
    });

    it('needs the class and language from the query for staff without a student profile', async () => {
      expect((await current(authHeaders(A))).status).toBe(StatusCodes.BAD_REQUEST);
      const res = await current(authHeaders(A), { licenceClass: 'B', language: 'en' });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body.version).toBe(202602);
    });
  });
});
