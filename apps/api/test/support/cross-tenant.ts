import { randomUUID } from 'node:crypto';
import { METHODS } from 'node:http';
import { type INestApplication, RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import request, { type Response } from 'supertest';
import { expect } from 'vitest';
import { IS_PUBLIC } from '../../src/kernel/auth/public.decorator.js';
import { type RateLimitRule, rateLimitRules } from '../../src/kernel/http/rate-limit.decorator.js';
import {
  type PermissionRequirement,
  REQUIRED_PERMISSIONS,
} from '../../src/modules/identity/http/require-permission.decorator.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { API_PREFIX, UNPREFIXED_CONTROLLERS } from '../../src/http-app.js';
import type { ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp } from './kernel-app.js';
import { authHeaders, createTestTenants, type TestTenant, type TestTenants } from './tenants.js';
import { StatusCodes } from 'http-status-codes';

export const FIXTURES_FILE = 'apps/api/test/support/route-fixtures.ts';
export const ALLOWLIST_FILE = 'apps/api/test/support/route-allowlist.ts';

export interface RegisteredRoute {
  key: string;
  method: string;
  path: string;
  source: 'controller' | 'http-adapter';
  isPublic: boolean;
  permissions?: PermissionRequirement;
  rateLimits?: RateLimitRule[];
}

export type HttpAgent = ReturnType<typeof request>;

export interface FixtureContext {
  app: INestApplication;
  request: HttpAgent;
  tenants: TestTenants;
  A: TestTenant;
  B: TestTenant;
  auth(tenant: TestTenant): Record<string, string>;
}

export interface FixtureRequest {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  aIds?: string[];
}

export interface RouteFixture {
  setup?: (ctx: FixtureContext) => Promise<FixtureRequest>;
  expect?: (res: Response, ctx: FixtureContext, req: FixtureRequest) => void | Promise<void>;
}

export type RouteFixtures = Record<string, RouteFixture>;

export type AllowReason = 'public' | 'caller-scoped';

export interface AllowlistEntry {
  reason: AllowReason;
  note: string;
}

export type RouteAllowlist = Record<string, AllowlistEntry>;

export interface CrossTenantApp {
  app: INestApplication;
  readonly context: FixtureContext;
  close(): Promise<void>;
}

interface ExpressLayer {
  route?: { path: unknown; methods: Record<string, boolean> };
}

const ALL_METHODS = METHODS.map((method) => method.toLowerCase());

function joinPath(...parts: string[]): string {
  const segments = parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter(Boolean);
  return `/${segments.join('/')}`;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [value === undefined ? '' : String(value)];
}

function adapterRoutes(app: INestApplication): { method: string; path: string }[] {
  const instance = app.getHttpAdapter().getInstance();
  const stack: ExpressLayer[] = (instance.router ?? instance._router)?.stack ?? [];
  const routes: { method: string; path: string }[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all');
    const all = layer.route.methods._all === true || ALL_METHODS.every((m) => methods.includes(m));
    for (const path of asList(layer.route.path)) {
      if (all) routes.push({ method: 'ALL', path });
      else for (const method of methods) routes.push({ method: method.toUpperCase(), path });
    }
  }
  return routes;
}

function controllerRoutes(app: INestApplication): RegisteredRoute[] {
  const modules = app.get(ModulesContainer);
  const scanner = new MetadataScanner();
  const reflector = new Reflector();
  const routes: RegisteredRoute[] = [];
  for (const moduleRef of modules.values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const controller = wrapper.metatype as Type | null;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      const controllerPaths = asList(Reflect.getMetadata(PATH_METADATA, controller));
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as object;
        const methodPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        if (methodPath === undefined) continue;
        const requestMethod: RequestMethod =
          Reflect.getMetadata(METHOD_METADATA, handler) ?? RequestMethod.GET;
        const method = RequestMethod[requestMethod];
        const permissions = reflector.getAllAndOverride<PermissionRequirement | undefined>(
          REQUIRED_PERMISSIONS,
          [handler as never, controller],
        );
        const isPublic =
          reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler as never, controller]) === true;
        for (const base of controllerPaths) {
          for (const sub of asList(methodPath)) {
            const prefix = UNPREFIXED_CONTROLLERS.includes(base) ? '' : API_PREFIX;
            const path = joinPath(prefix, base, sub);
            routes.push({
              key: `${method} ${path}`,
              method,
              path,
              source: 'controller',
              isPublic,
              permissions,
              rateLimits: rateLimitRules(handler, controller),
            });
          }
        }
      }
    }
  }
  return routes;
}

export function listRoutes(app: INestApplication): RegisteredRoute[] {
  const fromAdapter = adapterRoutes(app);
  const adapterKeys = new Set(fromAdapter.map((route) => `${route.method} ${route.path}`));
  const fromControllers = controllerRoutes(app);
  const controllerKeys = new Set(fromControllers.map((route) => route.key));
  for (const route of fromControllers) {
    if (!adapterKeys.has(route.key)) {
      throw new Error(
        `Controller route ${route.key} was not found in the HTTP adapter's router; the route walker cannot map its path`,
      );
    }
  }
  const extra = fromAdapter
    .filter((route) => route.method !== 'ALL')
    .map((route): RegisteredRoute => {
      const key = `${route.method} ${route.path}`;
      return {
        key,
        method: route.method,
        path: route.path,
        source: 'http-adapter',
        isPublic: true,
      };
    })
    .filter((route) => !controllerKeys.has(route.key));
  const byKey = new Map<string, RegisteredRoute>();
  for (const route of [...fromControllers, ...extra]) byKey.set(route.key, route);
  return [...byKey.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

export function checkRouteRegistry(
  routes: readonly RegisteredRoute[],
  fixtures: RouteFixtures,
  allowlist: RouteAllowlist,
): string[] {
  const problems: string[] = [];
  const registered = new Set(routes.map((route) => route.key));
  for (const route of routes) {
    const fixture = fixtures[route.key];
    const allowed = allowlist[route.key];
    if (!fixture && !allowed) {
      problems.push(
        `${route.key} has no cross-tenant fixture and is not on the allowlist. Add a fixture to ${FIXTURES_FILE} (preferred) or an entry with a reason to ${ALLOWLIST_FILE}.`,
      );
    } else if (fixture && allowed) {
      problems.push(
        `${route.key} has both a fixture and an allowlist entry; keep only one (${FIXTURES_FILE} or ${ALLOWLIST_FILE}).`,
      );
    } else if (allowed?.reason === 'public' && !route.isPublic) {
      problems.push(
        `${route.key} is allowlisted as public but is not @Public(); it needs a fixture or a different reason.`,
      );
    }
  }
  for (const key of Object.keys(fixtures)) {
    if (!registered.has(key)) {
      problems.push(`Fixture "${key}" in ${FIXTURES_FILE} is not a registered route; remove it.`);
    }
  }
  for (const key of Object.keys(allowlist)) {
    if (!registered.has(key)) {
      problems.push(
        `Allowlist entry "${key}" in ${ALLOWLIST_FILE} is not a registered route; remove it.`,
      );
    }
  }
  return problems;
}

export function parseRouteKey(key: string): { method: string; path: string } {
  const match = /^([A-Z]+) (\/\S*)$/.exec(key);
  if (!match?.[1] || !match[2])
    throw new Error(`Invalid route key "${key}", expected "METHOD /path"`);
  return { method: match[1], path: match[2] };
}

export function placeholderParams(path: string): Record<string, string> {
  return Object.fromEntries(
    [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => [match[1] ?? '', randomUUID()]),
  );
}

function resolvePath(key: string, path: string, params: Record<string, string>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`${key}: setup returned no value for path param :${name}`);
    }
    return encodeURIComponent(value);
  });
}

function send(agent: HttpAgent, method: string, url: string) {
  switch (method) {
    case 'GET':
      return agent.get(url);
    case 'POST':
      return agent.post(url);
    case 'PUT':
      return agent.put(url);
    case 'PATCH':
      return agent.patch(url);
    case 'DELETE':
      return agent.delete(url);
    case 'HEAD':
      return agent.head(url);
    case 'OPTIONS':
      return agent.options(url);
    default:
      throw new Error(`Unsupported method ${method}`);
  }
}

export async function callRoute(
  agent: HttpAgent,
  key: string,
  req: FixtureRequest,
  headers: Record<string, string>,
): Promise<Response> {
  const { method, path } = parseRouteKey(key);
  const url = resolvePath(key, path, req.params ?? {});
  let call = send(agent, method, url).set({ ...headers, ...req.headers });
  if (req.query) call = call.query(req.query);
  if (req.body !== undefined) call = call.send(req.body as object);
  return call;
}

export function assertNoLeak(key: string, res: Response, secrets: readonly string[]): void {
  const exposed = [
    res.text ?? '',
    JSON.stringify(res.body ?? null),
    JSON.stringify(res.headers),
  ].join('\n');
  for (const secret of secrets) {
    if (secret && exposed.includes(secret)) {
      throw new Error(
        `${key} as school B: response contains A's id ${secret} (status ${res.status}): ${exposed.slice(0, 500)}`,
      );
    }
  }
}

export async function runRouteFixture(
  ctx: FixtureContext,
  key: string,
  fixture: RouteFixture,
): Promise<Response> {
  const req = (await fixture.setup?.(ctx)) ?? {};
  const res = await callRoute(ctx.request, key, req, ctx.auth(ctx.B));
  if (fixture.expect) {
    await fixture.expect(res, ctx, req);
  } else if (res.status !== StatusCodes.FORBIDDEN && res.status !== StatusCodes.NOT_FOUND) {
    throw new Error(
      `${key} as school B: expected 403 or 404, got ${res.status}: ${(res.text ?? '').slice(0, 300)}`,
    );
  }
  assertNoLeak(key, res, [
    ctx.A.schoolId,
    ctx.A.ownerUserId,
    ctx.A.ownerMembershipId,
    ...(req.aIds ?? []),
    ...Object.values(req.params ?? {}),
  ]);
  return res;
}

export async function createCrossTenantApp(
  db: ScratchDatabase,
  modules: Type[] = [],
  options: { tenants?: boolean } = {},
): Promise<CrossTenantApp> {
  const kernel = await createKernelTestApp(db, modules);
  let tenants: TestTenants | undefined;
  try {
    if (options.tenants ?? true) {
      tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    }
  } catch (error) {
    await kernel.close();
    throw error;
  }
  const context: FixtureContext | undefined = tenants && {
    app: kernel.app,
    request: request(kernel.app.getHttpServer()),
    tenants,
    A: tenants.A,
    B: tenants.B,
    auth: authHeaders,
  };
  return {
    app: kernel.app,
    get context(): FixtureContext {
      if (!context) throw new Error('createCrossTenantApp was called with { tenants: false }');
      return context;
    },
    close: () => kernel.close(),
  };
}

export function expectListResponse(field = 'items') {
  return (res: Response): void => {
    expect(res.status).toBe(StatusCodes.OK);
    expect(Array.isArray((res.body as Record<string, unknown>)[field])).toBe(true);
  };
}
