import { expect } from 'vitest';
import { StatusCodes } from 'http-status-codes';
import { createStudent } from '../identity/support.js';
import {
  expectListResponse,
  type FixtureContext,
  type RouteFixtures,
} from '../support/cross-tenant.js';
import { createContractRow, createDocumentRow, createTemplateRow } from './support.js';

const studentOfA = (ctx: FixtureContext) =>
  createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' });

const documentOfA = async (ctx: FixtureContext) =>
  createDocumentRow(ctx.tenants, ctx.A, { ownerStudentId: await studentOfA(ctx) });

const contractOfA = async (ctx: FixtureContext) =>
  createContractRow(ctx.tenants, ctx.A, {
    studentId: await studentOfA(ctx),
    templateId: await createTemplateRow(ctx.tenants, ctx.A),
  });

export const documentsFixtures: RouteFixtures = {
  'POST /v1/documents/upload-url': {
    setup: async (ctx) => {
      const studentId = await studentOfA(ctx);
      return {
        body: {
          kind: 'eye_test',
          mime: 'application/pdf',
          sizeBytes: 1024,
          ownerStudentId: studentId,
        },
        aIds: [studentId],
      };
    },
  },
  'POST /v1/documents/:id/complete': {
    setup: async (ctx) => ({ params: { id: await documentOfA(ctx) } }),
  },
  'GET /v1/documents': {
    setup: async (ctx) => ({ aIds: [await documentOfA(ctx)] }),
    expect: expectListResponse('items'),
  },
  'GET /v1/documents/:id/download-url': {
    setup: async (ctx) => ({ params: { id: await documentOfA(ctx) } }),
  },
  'GET /v1/contract-templates': {
    setup: async (ctx) => ({ aIds: [await createTemplateRow(ctx.tenants, ctx.A)] }),
    expect: expectListResponse('items'),
  },
  'POST /v1/contract-templates': {
    setup: async (ctx) => {
      const name = 'Cross tenant template';
      const aId = await createTemplateRow(ctx.tenants, ctx.A, { name });
      return { body: { name, body: 'From school B' }, aIds: [aId] };
    },
    expect: (res) => {
      expect(res.status).toBe(StatusCodes.CREATED);
      expect((res.body as { version: number }).version).toBe(1);
    },
  },
  'POST /v1/contracts': {
    setup: async (ctx) => {
      const studentId = await studentOfA(ctx);
      const templateId = await createTemplateRow(ctx.tenants, ctx.A);
      return { body: { studentId, templateId }, aIds: [studentId, templateId] };
    },
  },
  'GET /v1/contracts/:id': {
    setup: async (ctx) => ({ params: { id: await contractOfA(ctx) } }),
  },
  'POST /v1/contracts/:id/sign': {
    setup: async (ctx) => ({ params: { id: await contractOfA(ctx) }, body: {} }),
  },
  'GET /v1/contracts': {
    setup: async (ctx) => ({ aIds: [await contractOfA(ctx)] }),
    expect: expectListResponse('items'),
  },
};
