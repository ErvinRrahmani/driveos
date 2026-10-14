import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../src/kernel/openapi/document.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { PingModule } from '../fixtures/ping/index.js';
import {
  assertNoLeak,
  callRoute,
  checkRouteRegistry,
  createCrossTenantApp,
  type CrossTenantApp,
  listRoutes,
  placeholderParams,
  type RegisteredRoute,
  runRouteFixture,
} from '../support/cross-tenant.js';
import { ROUTE_ALLOWLIST } from '../support/route-allowlist.js';
import { fixtureFor, ROUTE_FIXTURES } from '../support/route-fixtures.js';
import { STUB_ROUTES } from '../support/spec-routes.js';
import { StatusCodes } from 'http-status-codes';

const NO_TENANT_DATA_ROUTES: readonly RegExp[] = [
  /^GET \/v1\/health$/,
  /^POST \/v1\/auth\/(code|verify|refresh|logout)$/,
  /^POST \/v1\/webhooks\/payments\/:provider$/,
  // Published page data only, resolved by slug through school_id_for_public_slug (design §5.1).
  /^GET \/v1\/public\/schools\/:slug$/,
  /^(GET|POST) \/fake-pay\//,
  /^GET \/docs/,
  /^GET \/v1\/me$/,
];

const OPENAPI_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const expressPath = (path: string) => path.replace(/\{(\w+)\}/g, ':$1');

const allowlisted = (reason: string) =>
  Object.entries(ROUTE_ALLOWLIST)
    .filter(([, entry]) => entry.reason === reason)
    .map(([key]) => key);

describe('generic cross-tenant route test', () => {
  let db: ScratchDatabase;
  let harness: CrossTenantApp;
  let routes: Map<string, RegisteredRoute>;

  const registered = (key: string): RegisteredRoute => {
    const route = routes.get(key);
    if (!route) throw new Error(`${key} is not a registered route`);
    return route;
  };

  beforeAll(async () => {
    db = await createScratchDatabase();
    harness = await createCrossTenantApp(db, [PingModule]);
    routes = new Map(listRoutes(harness.app).map((route) => [route.key, route]));
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await db?.drop();
  });

  it('covers every registered route with a fixture or an allowlist entry, and nothing else', () => {
    const problems = checkRouteRegistry([...routes.values()], ROUTE_FIXTURES, ROUTE_ALLOWLIST);

    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });

  it.each(Object.keys(ROUTE_FIXTURES))(
    "%s called as school B gets 403/404 (or the fixture's expectation) and none of A's ids",
    async (key) => {
      registered(key);
      await runRouteFixture(harness.context, key, fixtureFor(key));
    },
  );

  it.each(allowlisted('public'))('%s is public: reachable without auth headers', async (key) => {
    const route = registered(key);
    const res = await callRoute(
      harness.context.request,
      key,
      { params: placeholderParams(route.path) },
      {},
    );

    expect(res.status, `${key} → ${res.status} ${res.text?.slice(0, 200)}`).not.toBe(
      StatusCodes.UNAUTHORIZED,
    );
    expect(res.status).not.toBe(StatusCodes.FORBIDDEN);
    expect(res.status).toBeLessThan(StatusCodes.INTERNAL_SERVER_ERROR);
  });

  it('has no 501 stub routes left: every SPEC §8 route is implemented', () => {
    expect(STUB_ROUTES.map((route) => `${route.method} ${route.path}`)).toEqual([]);
  });

  it('allowlists only routes that carry no tenant data by design', () => {
    const tenantRoutes = Object.keys(ROUTE_ALLOWLIST).filter(
      (key) => !NO_TENANT_DATA_ROUTES.some((pattern) => pattern.test(key)),
    );

    expect(tenantRoutes, 'tenant routes need a fixture in route-fixtures.ts').toEqual([]);
    expect(allowlisted('caller-scoped')).toEqual(['GET /v1/me']);
  });

  it('covers every operation of the OpenAPI document with a fixture or a no-tenant-data entry', () => {
    const doc = buildOpenApiDocument(harness.app);
    const operations = Object.entries(doc.paths).flatMap(([path, item]) =>
      OPENAPI_METHODS.filter((method) => item[method]).map(
        (method) => `${method.toUpperCase()} ${expressPath(path)}`,
      ),
    );
    const uncovered = operations.filter((key) => !ROUTE_FIXTURES[key] && !ROUTE_ALLOWLIST[key]);

    expect(operations.length).toBeGreaterThan(100);
    expect(
      uncovered,
      'add a cross-tenant fixture to apps/api/test/support/route-fixtures.ts',
    ).toEqual([]);
  });

  it.each(allowlisted('caller-scoped').filter((key) => key.startsWith('GET ')))(
    "%s is caller-scoped: as school B it answers without any of A's ids",
    async (key) => {
      const route = registered(key);
      const { A, B } = harness.context;
      const res = await callRoute(
        harness.context.request,
        key,
        { params: placeholderParams(route.path) },
        harness.context.auth(B),
      );

      expect(res.status).toBeLessThan(StatusCodes.INTERNAL_SERVER_ERROR);
      assertNoLeak(key, res, [A.schoolId, A.ownerUserId, A.ownerMembershipId]);
    },
  );
});
