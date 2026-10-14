import { randomUUID } from 'node:crypto';
import { newId } from '../../src/kernel/db/columns.js';
import { questionPacks, questions, theorySessions } from '../../src/modules/theory/infra/schema.js';
import { students } from '../../src/modules/training/infra/schema.js';
import type { FixtureContext, RouteFixtures } from '../support/cross-tenant.js';
import type { TestTenant } from '../support/tenants.js';
import { createLogin } from '../training/support.js';

let packVersions = 0;

const packBody = () => ({
  country: 'DE',
  licenceClass: 'B',
  language: 'en',
  version: '2099.1',
  exam: { rules: 'fraction', questions: 1, timeLimitMinutes: 5, passMark: 0.5 },
  questions: [
    {
      ref: 'CROSS-1',
      category: 'signs',
      body: 'SAMPLE: cross tenant?',
      media: null,
      answers: ['yes', 'no'],
      correct: [0],
      points: 1,
      explanation: 'SAMPLE',
    },
  ],
});

async function publishedPackForCountryOfA({ tenants }: FixtureContext): Promise<string> {
  const id = newId();
  packVersions += 1;
  await tenants.asSystem((tx) =>
    tx.insert(questionPacks).values({
      id,
      countryCode: 'DE',
      licenceClass: 'CT',
      language: 'en',
      version: 900_000 + packVersions,
      examRules: { rules: 'fraction', questions: 1, timeLimitMinutes: 5, passMark: 0.5 },
      status: 'published',
      publishedAt: new Date(),
    }),
  );
  return id;
}

async function studentIn(
  { tenants }: FixtureContext,
  tenant: TestTenant,
  userId: string | null = null,
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(students).values({
      id,
      schoolId: tenant.schoolId,
      userId,
      dateOfBirth: '2000-01-01',
      licenceClass: 'B',
      examLanguage: 'en',
      status: 'active',
    }),
  );
  return id;
}

async function studentLoginIn(ctx: FixtureContext, tenant: TestTenant) {
  const login = await createLogin(ctx.tenants, tenant, ['student']);
  await studentIn(ctx, tenant, login.userId);
  return login.headers;
}

async function sessionInA(
  ctx: FixtureContext,
): Promise<{ sessionId: string; questionId: string; studentId: string }> {
  const packId = await publishedPackForCountryOfA(ctx);
  const questionId = newId();
  await ctx.tenants.asSystem((tx) =>
    tx.insert(questions).values({
      id: questionId,
      packId,
      externalRef: 'CROSS-1',
      category: 'signs',
      body: 'SAMPLE: cross tenant?',
      answers: ['yes', 'no'],
      correct: [0],
      points: 1,
      explanation: 'SAMPLE',
    }),
  );
  const studentId = await studentIn(ctx, ctx.A);
  const sessionId = newId();
  await ctx.tenants.asSchool(ctx.A, (tx) =>
    tx.insert(theorySessions).values({
      id: sessionId,
      schoolId: ctx.A.schoolId,
      studentId,
      packId,
      mode: 'practice',
      questionIds: [questionId],
      startedAt: new Date(),
    }),
  );
  return { sessionId, questionId, studentId };
}

export const theoryFixtures: RouteFixtures = {
  'POST /v1/theory/sessions': {
    setup: async (ctx) => ({
      body: { mode: 'practice' },
      headers: await studentLoginIn(ctx, ctx.B),
    }),
  },
  'POST /v1/theory/sessions/:id/answers': {
    setup: async (ctx) => {
      const { sessionId, questionId, studentId } = await sessionInA(ctx);
      return {
        params: { id: sessionId },
        body: { questionId, given: [0] },
        headers: await studentLoginIn(ctx, ctx.B),
        aIds: [questionId, studentId],
      };
    },
  },
  'POST /v1/theory/sessions/:id/finish': {
    setup: async (ctx) => {
      const { sessionId, questionId, studentId } = await sessionInA(ctx);
      return {
        params: { id: sessionId },
        headers: await studentLoginIn(ctx, ctx.B),
        aIds: [questionId, studentId],
      };
    },
  },
  'GET /v1/theory/mistakes': {
    setup: async (ctx) => {
      const { questionId, studentId } = await sessionInA(ctx);
      return { headers: await studentLoginIn(ctx, ctx.B), aIds: [questionId, studentId] };
    },
  },
  'GET /v1/theory/stats': {
    setup: async (ctx) => {
      const { studentId } = await sessionInA(ctx);
      return { query: { studentId }, aIds: [studentId] };
    },
  },
  'GET /v1/question-packs/current': {
    setup: async (ctx) => ({
      query: { licenceClass: 'CT', language: 'en' },
      aIds: [await publishedPackForCountryOfA(ctx)],
    }),
  },
  'POST /v1/platform/question-packs/import': {
    setup: async () => ({ body: packBody() }),
  },
  'POST /v1/platform/question-packs/:id/publish': {
    setup: async () => ({ params: { id: randomUUID() } }),
  },
};
