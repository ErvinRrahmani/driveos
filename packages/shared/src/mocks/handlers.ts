import { delay, http, HttpResponse, type HttpHandler } from 'msw';
import type { z } from 'zod';
import * as dto from '../dto/index.js';
import { DTO_SAMPLES } from '../dto/samples/index.js';
import { collectionResolvers } from './collections.js';
import {
  commandResult,
  fail,
  type MockContext,
  MockHttpError,
  type MockReply,
  type MockResolver,
} from './context.js';
import { MOCK_ROUTES } from './generated/routes.js';
import { identityResolvers } from './identity.js';
import { lessonResolvers } from './lessons.js';
import { reportResolvers } from './reports.js';
import type { MockRoute } from './routes.js';
import { schedulingOfferResolvers } from './scheduling-offers.js';
import type { MockSession, MockStore } from './store.js';
import { syncResolvers } from './sync.js';
import { StatusCodes } from 'http-status-codes';

const RESOLVERS: Record<string, MockResolver> = {
  ...identityResolvers,
  ...collectionResolvers,
  ...lessonResolvers,
  ...syncResolvers,
  ...schedulingOfferResolvers,
  ...reportResolvers,
};

const PDF = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

export function schemaFor(component: string): z.ZodType | undefined {
  return (dto as Record<string, unknown>)[`${lowerFirst(component)}Schema`] as
    z.ZodType | undefined;
}

export function sampleFor(component: string): unknown {
  for (const samples of Object.values(DTO_SAMPLES)) {
    const sample = (samples as Record<string, unknown>)[lowerFirst(component)];
    if (sample !== undefined) return structuredClone(sample);
  }
  return undefined;
}

function defaultReply(context: MockContext): MockReply {
  const { route, params, store } = context;
  if (route.produces !== 'json' || !route.response) return {};
  if (route.response === 'CommandResult') {
    if (route.status === StatusCodes.CREATED) return { body: commandResult(store.nextId(), 1) };
    const schoolId = context.session?.activeMembershipId
      ? store.memberships.get(context.session.activeMembershipId)?.schoolId
      : undefined;
    return { body: commandResult(params.id ?? params.linkId ?? schoolId ?? store.nextId(), 2) };
  }
  const sample = sampleFor(route.response);
  if (sample === undefined) throw new Error(`No mock body for ${route.operationId}`);
  return { body: sample };
}

function authenticate(request: Request, store: MockStore): MockSession | null {
  const header = request.headers.get('authorization');
  if (!header) return store.currentSession();
  const token = header.replace(/^Bearer\s+/i, '');
  return (
    store.sessions.get(token) ??
    fail(StatusCodes.UNAUTHORIZED, 'unauthenticated', 'The access token is not valid.')
  );
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail(StatusCodes.BAD_REQUEST, 'validation_error', 'The body is not valid JSON.');
  }
}

function validate(route: MockRoute, raw: unknown): unknown {
  const schema = route.request ? schemaFor(route.request) : undefined;
  if (!schema) return raw;
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success)
    fail(
      StatusCodes.BAD_REQUEST,
      'validation_error',
      'The request is invalid.',
      parsed.error.issues,
    );
  return parsed.data;
}

function respond(route: MockRoute, reply: MockReply): Response {
  const status = reply.status ?? route.status;
  if (route.produces === 'pdf') {
    return new HttpResponse(PDF, { status, headers: { 'content-type': 'application/pdf' } });
  }
  if (route.produces === 'none' || reply.body === undefined)
    return new HttpResponse(null, { status });
  return HttpResponse.json(reply.body as Record<string, unknown>, { status });
}

function errorResponse(error: MockHttpError): Response {
  const details = error.details === undefined ? {} : { details: error.details };
  return HttpResponse.json(
    { error: { code: error.code, message: error.message, ...details } },
    { status: error.status },
  );
}

function replay(context: MockContext, compute: () => MockReply): MockReply {
  const key = context.request.headers.get('idempotency-key');
  if (!key)
    return fail(
      StatusCodes.BAD_REQUEST,
      'idempotency_key_required',
      'This request requires an Idempotency-Key header.',
    );
  const cacheKey = `${context.session?.userId ?? ''}|${context.route.operationId}|${key}`;
  const hash = JSON.stringify([context.url.pathname, context.body]);
  const stored = context.store.idempotency.get(cacheKey);
  if (stored) {
    if (stored.hash !== hash) {
      fail(
        StatusCodes.UNPROCESSABLE_ENTITY,
        'idempotency_key_reused',
        'This Idempotency-Key was already used for a different request.',
      );
    }
    return { status: stored.status, body: structuredClone(stored.body) };
  }
  const reply = compute();
  context.store.idempotency.set(cacheKey, {
    hash,
    status: reply.status ?? context.route.status,
    body: structuredClone(reply.body),
  });
  return reply;
}

export interface HandlerOptions {
  baseUrl: string;
  latencyMs: number;
}

export function createHandlers(store: MockStore, options: HandlerOptions): HttpHandler[] {
  const base = options.baseUrl.replace(/\/$/, '');
  return MOCK_ROUTES.map((route: MockRoute) =>
    http[route.method](`${base}${route.mswPath}`, async ({ request, params }) => {
      if (options.latencyMs > 0) await delay(options.latencyMs);
      try {
        const session = route.public ? store.currentSession() : authenticate(request, store);
        if (!route.public && !session)
          fail(StatusCodes.UNAUTHORIZED, 'unauthenticated', 'Sign in first.');
        const context: MockContext = {
          store,
          route,
          request,
          url: new URL(request.url),
          params: Object.fromEntries(
            Object.entries(params).map(([name, value]) => [name, String(value)]),
          ),
          body: validate(route, await readBody(request)),
          session,
        };
        const resolve = RESOLVERS[route.operationId] ?? defaultReply;
        const reply = route.idempotent ? replay(context, () => resolve(context)) : resolve(context);
        return respond(route, reply);
      } catch (error) {
        if (error instanceof MockHttpError) return errorResponse(error);
        throw error;
      }
    }),
  );
}
