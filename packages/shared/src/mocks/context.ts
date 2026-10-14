import type { MockRoute } from './routes.js';
import type { MockMembership, MockSession, MockStore, Scoped } from './store.js';
import { StatusCodes } from 'http-status-codes';

export interface MockContext {
  store: MockStore;
  route: MockRoute;
  request: Request;
  url: URL;
  params: Record<string, string>;
  body: unknown;
  session: MockSession | null;
}

export interface MockReply {
  status?: number;
  body?: unknown;
}

export type MockResolver = (context: MockContext) => MockReply;

export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new MockHttpError(status, code, message, details);
}

export const notFound = (): never => fail(StatusCodes.NOT_FOUND, 'not_found', 'Not found.');

export function requireSession(context: MockContext): MockSession {
  return context.session ?? fail(StatusCodes.UNAUTHORIZED, 'unauthenticated', 'Sign in first.');
}

export function requireSchool(context: MockContext): {
  schoolId: string;
  membership: MockMembership;
} {
  const session = requireSession(context);
  const membership = session.activeMembershipId
    ? context.store.memberships.get(session.activeMembershipId)
    : undefined;
  if (!membership)
    fail(StatusCodes.FORBIDDEN, 'school_required', 'This request requires a school.');
  return { schoolId: membership.schoolId, membership };
}

export function inSchool<T>(
  map: Map<string, Scoped<T>>,
  id: string | undefined,
  schoolId: string,
): Scoped<T> {
  const record = id === undefined ? undefined : map.get(id);
  if (!record || (record.schoolId !== null && record.schoolId !== schoolId)) return notFound();
  return record;
}

export function body<T>(context: MockContext): T {
  return context.body as T;
}

export function page<T>(items: T[], url: URL): { items: T[]; nextCursor: string | null } {
  const limit = Math.max(1, Number(url.searchParams.get('limit')) || 50);
  const offset = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
  const next = offset + limit;
  return {
    items: items.slice(offset, next),
    nextCursor: next < items.length ? String(next) : null,
  };
}

export const commandResult = (id: string, version: number) => ({ id, version });
