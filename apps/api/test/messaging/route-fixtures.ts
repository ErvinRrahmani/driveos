import { createStudent } from '../identity/support.js';
import {
  expectListResponse,
  type FixtureContext,
  type RouteFixtures,
} from '../support/cross-tenant.js';
import { createConversationRow, createMessageRow } from './support.js';

const conversationOfA = async (ctx: FixtureContext) =>
  createConversationRow(ctx.tenants, ctx.A, {
    studentId: await createStudent(ctx.tenants, ctx.A, { dateOfBirth: '2000-01-01' }),
  });

export const messagingFixtures: RouteFixtures = {
  'GET /v1/conversations': {
    setup: async (ctx) => ({ aIds: [await conversationOfA(ctx)] }),
    expect: expectListResponse('items'),
  },
  'GET /v1/conversations/:id/messages': {
    setup: async (ctx) => {
      const id = await conversationOfA(ctx);
      const messageId = await createMessageRow(ctx.tenants, ctx.A, {
        conversationId: id,
        senderUserId: ctx.A.ownerUserId,
      });
      return { params: { id }, aIds: [messageId] };
    },
  },
  'POST /v1/conversations/:id/messages': {
    setup: async (ctx) => ({
      params: { id: await conversationOfA(ctx) },
      body: { body: 'From school B' },
    }),
  },
  'POST /v1/conversations/:id/read': {
    setup: async (ctx) => {
      const id = await conversationOfA(ctx);
      const messageId = await createMessageRow(ctx.tenants, ctx.A, {
        conversationId: id,
        senderUserId: ctx.A.ownerUserId,
      });
      return { params: { id }, body: { lastReadMessageId: messageId } };
    },
  },
};
