import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { platformStatements } from '../../src/modules/billing/infra/schema.js';
import { createStudent } from '../identity/support.js';
import {
  expectListResponse,
  type FixtureContext,
  type RouteFixtures,
} from '../support/cross-tenant.js';
import { StatusCodes } from 'http-status-codes';

const lessonItem = {
  name: 'Fixture lesson',
  kind: 'lesson',
  creditMinutes: 60,
  amountMinor: 6500,
  currency: 'EUR',
  taxRateBp: 1900,
};

async function priceItemOfA(ctx: FixtureContext): Promise<string> {
  const res = await ctx.request.post('/v1/price-items').set(ctx.auth(ctx.A)).send(lessonItem);
  expect(res.status).toBe(StatusCodes.CREATED);
  return res.body.id;
}

async function studentOfAWithCredit(
  ctx: FixtureContext,
): Promise<{ studentId: string; entryId: string }> {
  const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
  const res = await ctx.request
    .post('/v1/ledger/adjustments')
    .set(ctx.auth(ctx.A))
    .set('Idempotency-Key', `cross-tenant-${randomUUID()}`)
    .send({ studentId, minutes: 120, note: 'fixture', reason: 'fixture' });
  expect(res.status).toBe(StatusCodes.CREATED);
  return { studentId, entryId: res.body.id };
}

interface CashPaymentOfA {
  studentId: string;
  priceItemId: string;
  paymentId: string;
  invoiceId: string;
}

async function cashPaymentOfA(ctx: FixtureContext): Promise<CashPaymentOfA> {
  const priceItemId = await priceItemOfA(ctx);
  const studentId = await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });
  const res = await ctx.request
    .post('/v1/payments/cash')
    .set(ctx.auth(ctx.A))
    .set('Idempotency-Key', `cross-tenant-${randomUUID()}`)
    .send({ studentId, priceItemId, method: 'cash', amountMinor: 6500, currency: 'EUR' });
  expect(res.status).toBe(StatusCodes.CREATED);
  return { studentId, priceItemId, paymentId: res.body.id, invoiceId: res.body.invoiceId };
}

async function platformStatementOfA({ tenants, A }: FixtureContext): Promise<string> {
  const id = randomUUID();
  await tenants.asSchool(A, (tx) =>
    tx.insert(platformStatements).values({
      id,
      schoolId: A.schoolId,
      month: '2025-01-01',
      totalMinor: 5200,
      currency: 'EUR',
      status: 'issued',
      issuedAt: new Date('2025-02-01T02:00:00Z'),
    }),
  );
  return id;
}

const idempotencyKey = () => ({ 'Idempotency-Key': `cross-tenant-${randomUUID()}` });

export const billingFixtures: RouteFixtures = {
  'GET /v1/price-items': {
    setup: async (ctx) => ({ aIds: [await priceItemOfA(ctx)] }),
    expect: expectListResponse('items'),
  },
  'POST /v1/price-items': {
    setup: async (ctx) => ({ body: lessonItem, aIds: [await priceItemOfA(ctx)] }),
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.CREATED);
    },
  },
  'PATCH /v1/price-items/:id': {
    setup: async (ctx) => ({
      params: { id: await priceItemOfA(ctx) },
      body: { name: 'Renamed by B' },
    }),
  },
  'GET /v1/shop': {
    setup: async (ctx) => {
      const { studentId, entryId } = await studentOfAWithCredit(ctx);
      return {
        query: { studentId: studentId },
        aIds: [studentId, entryId],
      };
    },
  },
  'GET /v1/students/:id/balance': {
    setup: async (ctx) => {
      const { studentId, entryId } = await studentOfAWithCredit(ctx);
      return { params: { id: studentId }, aIds: [entryId] };
    },
  },
  'GET /v1/students/:id/ledger': {
    setup: async (ctx) => {
      const { studentId, entryId } = await studentOfAWithCredit(ctx);
      return { params: { id: studentId }, aIds: [entryId] };
    },
  },
  'POST /v1/ledger/adjustments': {
    setup: async (ctx) => {
      const { studentId, entryId } = await studentOfAWithCredit(ctx);
      return {
        body: { studentId, minutes: -60, note: 'from B', reason: 'cross-tenant' },
        headers: { 'Idempotency-Key': `cross-tenant-${randomUUID()}` },
        aIds: [studentId, entryId],
      };
    },
  },
  'POST /v1/checkout': {
    setup: async (ctx) => {
      const paid = await cashPaymentOfA(ctx);
      return {
        body: { priceItemId: paid.priceItemId, studentId: paid.studentId },
        headers: idempotencyKey(),
        aIds: Object.values(paid),
      };
    },
  },
  'GET /v1/invoices': {
    setup: async (ctx) => ({ aIds: Object.values(await cashPaymentOfA(ctx)) }),
    expect: expectListResponse('items'),
  },
  'GET /v1/invoices/:id.pdf': {
    setup: async (ctx) => {
      const paid = await cashPaymentOfA(ctx);
      return { params: { id: paid.invoiceId }, aIds: Object.values(paid) };
    },
  },
  'POST /v1/refunds': {
    setup: async (ctx) => {
      const paid = await cashPaymentOfA(ctx);
      return {
        body: {
          paymentId: paid.paymentId,
          amountMinor: 100,
          currency: 'EUR',
          minutesRemoved: 0,
          reason: 'cross-tenant',
        },
        headers: idempotencyKey(),
        aIds: Object.values(paid),
      };
    },
  },
  'POST /v1/payments/cash': {
    setup: async (ctx) => {
      const paid = await cashPaymentOfA(ctx);
      return {
        body: {
          studentId: paid.studentId,
          priceItemId: paid.priceItemId,
          method: 'cash',
          amountMinor: 6500,
          currency: 'EUR',
        },
        headers: idempotencyKey(),
        aIds: Object.values(paid),
      };
    },
  },
  'GET /v1/platform-statements': {
    setup: async (ctx) => ({ aIds: [await platformStatementOfA(ctx)] }),
    expect: expectListResponse('items'),
  },
};
