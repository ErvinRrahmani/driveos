import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TheorySessionFinished } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { GrantEntitlementCommand } from '../../src/modules/billing/index.js';
import { students } from '../../src/modules/training/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended } from '../support/events.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { assignInstructor, createLogin } from '../training/support.js';

const PACKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packs');

interface Learner {
  headers: Record<string, string>;
  studentId: string;
}

interface QuestionFacts {
  id: string;
  externalRef: string;
  packId: string;
  category: string;
  points: number;
  correct: number[];
  instantFail: boolean;
}

type Body = Record<string, unknown>;

const wrongFor = (correct: readonly number[]): number[] =>
  correct.length > 1 ? [correct[0] as number] : [((correct[0] as number) + 1) % 3];

describe('theory sessions (start, answer, finish, mistakes, stats)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let admin: Record<string, string>;

  const importAndPublish = async (overrides: Body): Promise<string> => {
    const raw = JSON.parse(
      await readFile(path.join(PACKS_DIR, 'sample-error-points-B-en.json'), 'utf8'),
    );
    const imported = await http
      .post('/v1/platform/question-packs/import')
      .set(admin)
      .send({ ...raw, country: 'DE', ...overrides });
    expect(imported.status).toBe(StatusCodes.CREATED);
    const published = await http
      .post(`/v1/platform/question-packs/${imported.body.id}/publish`)
      .set(admin)
      .send();
    expect(published.status).toBe(StatusCodes.OK);
    return imported.body.id as string;
  };

  const enrol = async (licenceClass = 'B'): Promise<Learner> => {
    const login = await createLogin(tenants, A, ['student']);
    const studentId = randomUUID();
    await tenants.asSchool(A, (tx) =>
      tx.insert(students).values({
        id: studentId,
        schoolId: A.schoolId,
        userId: login.userId,
        dateOfBirth: '2000-01-01',
        licenceClass,
        examLanguage: 'en',
        status: 'active',
      }),
    );
    return { headers: login.headers, studentId };
  };

  const grantPremium = (studentId: string) =>
    executeAs(kernel.app, A, new GrantEntitlementCommand({ studentId, kind: 'premium_theory' }));

  const setPremiumFree = (value: boolean) =>
    system.query(`update school_settings set theory_premium_free = $2 where school_id = $1`, [
      A.schoolId,
      value,
    ]);

  const start = (learner: Learner, body: Body) =>
    http.post('/v1/theory/sessions').set(learner.headers).send(body);
  const answer = (learner: Learner, sessionId: string, body: Body) =>
    http.post(`/v1/theory/sessions/${sessionId}/answers`).set(learner.headers).send(body);
  const finish = (learner: Learner, sessionId: string) =>
    http.post(`/v1/theory/sessions/${sessionId}/finish`).set(learner.headers).send();

  const facts = async (ids: readonly string[]): Promise<Map<string, QuestionFacts>> => {
    const { rows } = await system.query(
      `select id, external_ref, pack_id, category, points, correct, instant_fail
         from questions where id = any($1::uuid[])`,
      [ids],
    );
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          externalRef: row.external_ref,
          packId: row.pack_id,
          category: row.category,
          points: row.points,
          correct: row.correct,
          instantFail: row.instant_fail,
        },
      ]),
    );
  };

  const answerAll = async (
    learner: Learner,
    sessionId: string,
    questionIds: readonly string[],
    wrongIds: readonly string[] = [],
  ) => {
    const byId = await facts(questionIds);
    for (const id of questionIds) {
      const question = byId.get(id) as QuestionFacts;
      const given = wrongIds.includes(id) ? wrongFor(question.correct) : question.correct;
      const res = await answer(learner, sessionId, { questionId: id, given });
      expect(res.status).toBe(StatusCodes.OK);
    }
    return byId;
  };

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
    await importAndPublish({ version: '2026.1' });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  describe('POST /v1/theory/sessions', () => {
    it('starts a practice session with distinct questions and no correct answers', async () => {
      const learner = await enrol();
      const res = await start(learner, { mode: 'practice', questionCount: 3 });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body).toMatchObject({
        mode: 'practice',
        deadlineAt: null,
        finishedAt: null,
        answeredQuestionIds: [],
      });
      expect(res.body.questions).toHaveLength(3);
      expect(new Set(res.body.questionIds).size).toBe(3);
      expect(res.body.questions.map((q: Body) => q.id)).toEqual(res.body.questionIds);
      for (const question of res.body.questions) {
        expect(Object.keys(question).sort()).toEqual(
          ['answers', 'body', 'category', 'id', 'mediaUrl', 'points'].sort(),
        );
      }
      const { rows } = await system.query(
        `select student_id, mode, question_ids, deadline_at from theory_sessions where id = $1`,
        [res.body.id],
      );
      expect(rows[0]).toMatchObject({ student_id: learner.studentId, deadline_at: null });
    });

    it('filters practice by category and serves media through a signed URL', async () => {
      const learner = await enrol();
      const res = await start(learner, { mode: 'practice', category: 'signs', questionCount: 10 });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body.questions).toHaveLength(3);
      expect(res.body.questions.every((q: Body) => q.category === 'signs')).toBe(true);
      const withMedia = res.body.questions.filter((q: Body) => q.mediaUrl !== null);
      expect(withMedia).toHaveLength(1);
      expect(withMedia[0].mediaUrl).toContain('sample/warning-signs.png');
      const unknown = await start(learner, { mode: 'practice', category: 'parking' });
      expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    });

    it('draws a mock exam per category counts with a deadline from the time limit', async () => {
      const learner = await enrol();
      const res = await start(learner, { mode: 'mock' });
      expect(res.status).toBe(StatusCodes.CREATED);
      expect(res.body.questionIds).toHaveLength(4);
      const categories = res.body.questions.map((q: Body) => q.category).sort();
      expect(categories).toEqual(['rules', 'rules', 'signs', 'signs']);
      expect(new Date(res.body.deadlineAt).getTime() - new Date(res.body.startedAt).getTime()).toBe(
        10 * 60 * 1000,
      );
      for (const question of res.body.questions) expect(question).not.toHaveProperty('correct');
    });

    it('refuses a category or question count for a mock exam', async () => {
      const learner = await enrol();
      const res = await start(learner, { mode: 'mock', questionCount: 5 });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });

    it('returns 404 question_pack_missing when no pack is published for the student', async () => {
      const learner = await enrol('ZZ');
      const res = await start(learner, { mode: 'practice' });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(res.body.error.code).toBe('question_pack_missing');
    });

    it('refuses staff without a student profile and parents', async () => {
      const owner = await http
        .post('/v1/theory/sessions')
        .set(authHeaders(A))
        .send({ mode: 'practice' });
      expect(owner.status).toBe(StatusCodes.FORBIDDEN);
      const parent = await createLogin(tenants, A, ['parent']);
      const res = await http
        .post('/v1/theory/sessions')
        .set(parent.headers)
        .send({ mode: 'practice' });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('POST /v1/theory/sessions/{id}/answers', () => {
    it('reveals the result in practice and keeps the last answer per question', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'practice', questionCount: 2 });
      const questionId = session.body.questionIds[0] as string;
      const question = (await facts([questionId])).get(questionId) as QuestionFacts;
      const wrong = await answer(learner, session.body.id, {
        questionId,
        given: wrongFor(question.correct),
      });
      expect(wrong.status).toBe(StatusCodes.OK);
      expect(wrong.body).toMatchObject({
        questionId,
        correct: false,
        correctAnswers: question.correct,
        explanation: expect.stringContaining('SAMPLE'),
      });
      const right = await answer(learner, session.body.id, { questionId, given: question.correct });
      expect(right.body.correct).toBe(true);
      const { rows } = await system.query(
        `select correct from theory_answers where session_id = $1`,
        [session.body.id],
      );
      expect(rows).toEqual([{ correct: true }]);
    });

    it('hides the result in a mock exam', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'mock' });
      const questionId = session.body.questionIds[0] as string;
      const res = await answer(learner, session.body.id, { questionId, given: [0] });
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({
        questionId,
        correct: null,
        correctAnswers: null,
        explanation: null,
      });
    });

    it('rejects questions outside the session and unknown answer indexes', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'practice', questionCount: 1 });
      const outside = await answer(learner, session.body.id, {
        questionId: randomUUID(),
        given: [0],
      });
      expect(outside.status).toBe(StatusCodes.BAD_REQUEST);
      const index = await answer(learner, session.body.id, {
        questionId: session.body.questionIds[0],
        given: [7],
      });
      expect(index.status).toBe(StatusCodes.BAD_REQUEST);
    });

    it('rejects answers after the deadline but still lets the student finish', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'mock' });
      await system.query(
        `update theory_sessions set deadline_at = now() - interval '1 second' where id = $1`,
        [session.body.id],
      );
      const res = await answer(learner, session.body.id, {
        questionId: session.body.questionIds[0],
        given: [0],
      });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('session_expired');
      const { rows } = await system.query(
        `select count(*)::int as n from theory_answers where session_id = $1`,
        [session.body.id],
      );
      expect(rows[0].n).toBe(0);
      const finished = await finish(learner, session.body.id);
      expect(finished.status).toBe(StatusCodes.OK);
      expect(finished.body).toMatchObject({ score: 0, passed: false });
    });

    it("returns 404 for another student's session", async () => {
      const owner = await enrol();
      const other = await enrol();
      const session = await start(owner, { mode: 'practice', questionCount: 1 });
      const res = await answer(other, session.body.id, {
        questionId: session.body.questionIds[0],
        given: [0],
      });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect((await finish(other, session.body.id)).status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('POST /v1/theory/sessions/{id}/finish', () => {
    it('scores an all-right mock exam as passed and appends TheorySessionFinished', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'mock' });
      const byId = await answerAll(learner, session.body.id, session.body.questionIds);
      const maxScore = [...byId.values()].reduce((sum, q) => sum + q.points, 0);
      const res = await finish(learner, session.body.id);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({
        id: session.body.id,
        mode: 'mock',
        score: maxScore,
        maxScore,
        passed: true,
      });
      expect(res.body.results).toHaveLength(4);
      for (const result of res.body.results) {
        const question = byId.get(result.questionId) as QuestionFacts;
        expect(result).toMatchObject({
          correct: true,
          given: question.correct,
          correctAnswers: question.correct,
          points: question.points,
        });
      }
      const event = await expectEventAppended(
        db,
        { type: TheorySessionFinished, aggregateId: session.body.id },
        { count: 1 },
      );
      expect(event.payload).toMatchObject({
        sessionId: session.body.id,
        studentId: learner.studentId,
        mode: 'mock',
        questionCount: 4,
        score: maxScore,
        maxScore,
        passed: true,
      });
      const again = await finish(learner, session.body.id);
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(again.body.error.code).toBe('session_finished');
      const late = await answer(learner, session.body.id, {
        questionId: session.body.questionIds[0],
        given: [0],
      });
      expect(late.body.error.code).toBe('session_finished');
    });

    it('passes a mock exam with one wrong low-point question', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'mock' });
      const byId = await facts(session.body.questionIds);
      const wrong = [...byId.values()].find((q) => q.category === 'signs') as QuestionFacts;
      await answerAll(learner, session.body.id, session.body.questionIds, [wrong.id]);
      const maxScore = [...byId.values()].reduce((sum, q) => sum + q.points, 0);
      const res = await finish(learner, session.body.id);
      expect(res.body).toMatchObject({ score: maxScore - wrong.points, maxScore, passed: true });
      const result = res.body.results.find((r: Body) => r.questionId === wrong.id);
      expect(result).toMatchObject({ correct: false, correctAnswers: wrong.correct });
    });

    it('fails a mock exam with one wrong high-point or instant-fail question', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'mock' });
      const byId = await facts(session.body.questionIds);
      const wrong = [...byId.values()].find(
        (q) => q.category === 'rules' && (q.points > 3 || q.instantFail),
      ) as QuestionFacts;
      await answerAll(learner, session.body.id, session.body.questionIds, [wrong.id]);
      const res = await finish(learner, session.body.id);
      expect(res.body.passed).toBe(false);
    });

    it('scores practice by points without a pass flag; unanswered counts as wrong', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'practice', questionCount: 3 });
      const [first] = session.body.questionIds as string[];
      const byId = await answerAll(learner, session.body.id, [first as string]);
      const all = await facts(session.body.questionIds);
      const res = await finish(learner, session.body.id);
      expect(res.body).toMatchObject({
        mode: 'practice',
        score: byId.get(first as string)?.points,
        maxScore: [...all.values()].reduce((sum, q) => sum + q.points, 0),
        passed: null,
      });
      expect(res.body.results.filter((r: Body) => r.given === null)).toHaveLength(2);
    });
  });

  describe('premium gating', () => {
    it('blocks the 4th mock exam in 7 days without premium', async () => {
      const learner = await enrol();
      for (let i = 0; i < 3; i += 1) {
        expect((await start(learner, { mode: 'mock' })).status).toBe(StatusCodes.CREATED);
      }
      const fourth = await start(learner, { mode: 'mock' });
      expect(fourth.status).toBe(StatusCodes.FORBIDDEN);
      expect(fourth.body.error.code).toBe('premium_required');
      await system.query(
        `update theory_sessions set started_at = now() - interval '8 days'
          where id = (select id from theory_sessions where student_id = $1 order by started_at limit 1)`,
        [learner.studentId],
      );
      expect((await start(learner, { mode: 'mock' })).status).toBe(StatusCodes.CREATED);
    });

    it('allows a 4th mock exam with a premium_theory entitlement', async () => {
      const learner = await enrol();
      await grantPremium(learner.studentId);
      for (let i = 0; i < 4; i += 1) {
        expect((await start(learner, { mode: 'mock' })).status).toBe(StatusCodes.CREATED);
      }
    });

    it('allows a 4th mock exam when the school makes premium theory free', async () => {
      const learner = await enrol();
      await setPremiumFree(true);
      try {
        for (let i = 0; i < 4; i += 1) {
          expect((await start(learner, { mode: 'mock' })).status).toBe(StatusCodes.CREATED);
        }
      } finally {
        await setPremiumFree(false);
      }
    });

    it('keeps mistakes mode for premium students', async () => {
      const learner = await enrol();
      const free = await start(learner, { mode: 'mistakes' });
      expect(free.status).toBe(StatusCodes.FORBIDDEN);
      expect(free.body.error.code).toBe('premium_required');
      await grantPremium(learner.studentId);
      const none = await start(learner, { mode: 'mistakes' });
      expect(none.status).toBe(StatusCodes.CONFLICT);
      expect(none.body.error.code).toBe('no_mistakes');
    });
  });

  describe('mistakes', () => {
    it('draws only the latest-wrong questions, matched across pack versions by external_ref', async () => {
      await importAndPublish({ licenceClass: 'BE', version: '2026.1' });
      const learner = await enrol('BE');
      await grantPremium(learner.studentId);
      const practice = await start(learner, { mode: 'practice', questionCount: 6 });
      const v1 = await facts(practice.body.questionIds);
      const byRef = new Map([...v1.values()].map((q) => [q.externalRef, q]));
      const wrongRefs = ['SAMPLE-EP-1.01', 'SAMPLE-EP-1.03', 'SAMPLE-EP-2.03'];
      const wrongIds = wrongRefs.map((ref) => (byRef.get(ref) as QuestionFacts).id);
      await answerAll(learner, practice.body.id, practice.body.questionIds, wrongIds);
      const fixed = byRef.get('SAMPLE-EP-2.03') as QuestionFacts;
      const retry = await start(learner, { mode: 'practice', category: 'rules', questionCount: 3 });
      expect(
        (await answer(learner, retry.body.id, { questionId: fixed.id, given: fixed.correct }))
          .status,
      ).toBe(StatusCodes.OK);

      const v2Pack = await importAndPublish({ licenceClass: 'BE', version: '2026.2' });
      const session = await start(learner, { mode: 'mistakes' });
      expect(session.status).toBe(StatusCodes.CREATED);
      expect(session.body.packId).toBe(v2Pack);
      const drawn = await facts(session.body.questionIds);
      expect([...drawn.values()].map((q) => q.externalRef).sort()).toEqual([
        'SAMPLE-EP-1.01',
        'SAMPLE-EP-1.03',
      ]);
      expect([...drawn.values()].every((q) => q.packId === v2Pack)).toBe(true);

      const v2First = [...drawn.values()].find(
        (q) => q.externalRef === 'SAMPLE-EP-1.01',
      ) as QuestionFacts;
      await answer(learner, session.body.id, { questionId: v2First.id, given: v2First.correct });
      const list = await http.get('/v1/theory/mistakes').set(learner.headers);
      expect(list.status).toBe(StatusCodes.OK);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({
        question: { category: 'signs' },
        wrongCount: 1,
        lastGiven: wrongFor((byRef.get('SAMPLE-EP-1.03') as QuestionFacts).correct),
      });
      const listed = await facts([list.body.items[0].question.id]);
      expect([...listed.values()][0]).toMatchObject({
        externalRef: 'SAMPLE-EP-1.03',
        packId: v2Pack,
      });
      const next = await start(learner, { mode: 'mistakes' });
      expect(next.body.questionIds).toEqual([list.body.items[0].question.id]);
    });

    it('lists mistakes newest first with category filter and cursor pages', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'practice', questionCount: 6 });
      const byId = await facts(session.body.questionIds);
      const order = [...byId.values()].filter((q) =>
        ['SAMPLE-EP-1.01', 'SAMPLE-EP-2.02', 'SAMPLE-EP-1.03'].includes(q.externalRef),
      );
      for (const question of order) {
        await answer(learner, session.body.id, {
          questionId: question.id,
          given: wrongFor(question.correct),
        });
      }
      const first = await http.get('/v1/theory/mistakes').query({ limit: 2 }).set(learner.headers);
      expect(first.status).toBe(StatusCodes.OK);
      expect(first.body.items.map((m: { question: Body }) => m.question.id)).toEqual(
        [...order]
          .reverse()
          .slice(0, 2)
          .map((q) => q.id),
      );
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await http
        .get('/v1/theory/mistakes')
        .query({ limit: 2, cursor: first.body.nextCursor })
        .set(learner.headers);
      expect(second.body.items.map((m: { question: Body }) => m.question.id)).toEqual([
        order[0]?.id,
      ]);
      expect(second.body.nextCursor).toBeNull();
      const rules = await http
        .get('/v1/theory/mistakes')
        .query({ category: 'rules' })
        .set(learner.headers);
      expect(rules.body.items).toHaveLength(1);
      expect(rules.body.items[0].question.category).toBe('rules');
    });

    it('does not count answers of an unfinished mock exam', async () => {
      const learner = await enrol();
      const session = await start(learner, { mode: 'mock' });
      const byId = await facts(session.body.questionIds);
      const question = [...byId.values()][0] as QuestionFacts;
      await answer(learner, session.body.id, {
        questionId: question.id,
        given: wrongFor(question.correct),
      });
      const before = await http.get('/v1/theory/mistakes').set(learner.headers);
      expect(before.body.items).toEqual([]);
      await finish(learner, session.body.id);
      const after = await http.get('/v1/theory/mistakes').set(learner.headers);
      expect(after.body.items).toHaveLength(1);
    });
  });

  describe('GET /v1/theory/stats', () => {
    it('reports own progress, mock results and the weekly allowance', async () => {
      const learner = await enrol();
      const mock = await start(learner, { mode: 'mock' });
      await answerAll(learner, mock.body.id, mock.body.questionIds);
      const finished = await finish(learner, mock.body.id);
      const res = await http.get('/v1/theory/stats').set(learner.headers);
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.body).toMatchObject({
        studentId: learner.studentId,
        premium: false,
        questions: 6,
        answered: 4,
        correct: 4,
        openMistakes: 0,
        mockExamsTaken: 1,
        mockExamsPassed: 1,
        lastMockScore: finished.body.score,
        lastMockMaxScore: finished.body.maxScore,
        mockExamsLeftThisWeek: 2,
      });
      expect(res.body.categories).toEqual([
        { category: 'rules', questions: 3, answered: 2, correct: 2 },
        { category: 'signs', questions: 3, answered: 2, correct: 2 },
      ]);
      await grantPremium(learner.studentId);
      const premium = await http.get('/v1/theory/stats').set(learner.headers);
      expect(premium.body).toMatchObject({ premium: true, mockExamsLeftThisWeek: null });
    });

    it('lets staff read a student and hides unrelated students from instructors', async () => {
      const learner = await enrol();
      const owner = await http
        .get('/v1/theory/stats')
        .query({ studentId: learner.studentId })
        .set(authHeaders(A));
      expect(owner.status).toBe(StatusCodes.OK);
      expect(owner.body.studentId).toBe(learner.studentId);
      const missing = await http.get('/v1/theory/stats').set(authHeaders(A));
      expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
      const instructor = await createLogin(tenants, A, ['instructor']);
      const hidden = await http
        .get('/v1/theory/stats')
        .query({ studentId: learner.studentId })
        .set(instructor.headers);
      expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
      await assignInstructor(tenants, A, learner.studentId, instructor.membershipId);
      const visible = await http
        .get('/v1/theory/stats')
        .query({ studentId: learner.studentId })
        .set(instructor.headers);
      expect(visible.status).toBe(StatusCodes.OK);
    });

    it("returns 404 for another student's stats", async () => {
      const learner = await enrol();
      const other = await enrol();
      const res = await http
        .get('/v1/theory/stats')
        .query({ studentId: other.studentId })
        .set(learner.headers);
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
