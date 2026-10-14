import { randomUUID } from 'node:crypto';
import { Controller, Get, HttpCode, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Public } from '../../src/kernel/auth/public.decorator.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { PingModule } from '../fixtures/ping/index.js';
import {
  checkRouteRegistry,
  createCrossTenantApp,
  type CrossTenantApp,
  expectListResponse,
  listRoutes,
  placeholderParams,
  type RouteAllowlist,
  type RouteFixtures,
  runRouteFixture,
} from '../support/cross-tenant.js';
import { ROUTE_ALLOWLIST } from '../support/route-allowlist.js';
import { fixtureFor, ROUTE_FIXTURES } from '../support/route-fixtures.js';
import { StatusCodes } from 'http-status-codes';

const leakedIds: string[] = [];

@Controller('harness')
class HarnessProbeController {
  @Get('leaky')
  leakyList(): { ids: string[] } {
    return { ids: [...leakedIds] };
  }

  @Get('echo/:id')
  @HttpCode(StatusCodes.NOT_FOUND)
  echoNotFound(@Param('id') id: string): unknown {
    return { error: { code: 'not_found', message: 'Not found', details: { id } } };
  }

  @Get('open/:id')
  open(): { ok: boolean } {
    return { ok: true };
  }

  @Get('hidden/:id')
  hidden(): never {
    throw new NotFoundException();
  }

  @Post('things')
  @HttpCode(StatusCodes.CREATED)
  create(): { id: string } {
    return { id: randomUUID() };
  }
}

@Public()
@Controller('harness-public')
class HarnessPublicController {
  @Get()
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({ controllers: [HarnessProbeController, HarnessPublicController] })
class HarnessProbeModule {}

@Controller('throwaway')
class ThrowawayController {
  @Get(':id')
  get(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({ controllers: [ThrowawayController] })
class ThrowawayModule {}

describe('route walker', () => {
  let db: ScratchDatabase;
  let harness: CrossTenantApp;

  beforeAll(async () => {
    db = await createScratchDatabase();
    harness = await createCrossTenantApp(db, [PingModule, HarnessProbeModule]);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await db?.drop();
  });

  it('lists every controller route and every route added on the HTTP adapter', () => {
    const routes = listRoutes(harness.app);
    const keys = routes.map((route) => route.key);

    expect(keys).toEqual(
      expect.arrayContaining([
        'GET /v1/health',
        'GET /v1/me',
        'POST /v1/auth/code',
        'GET /v1/ping',
        'POST /v1/ping',
        'GET /v1/harness/echo/:id',
        'POST /v1/harness/things',
        'GET /docs',
        'GET /docs-json',
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => key.startsWith('ALL '))).toEqual([]);
  });

  it('marks @Public() controller routes and adapter routes', () => {
    const byKey = new Map(listRoutes(harness.app).map((route) => [route.key, route]));

    expect(byKey.get('GET /v1/health')).toMatchObject({ source: 'controller', isPublic: true });
    expect(byKey.get('GET /v1/harness-public')).toMatchObject({
      source: 'controller',
      isPublic: true,
    });
    expect(byKey.get('GET /v1/me')).toMatchObject({ source: 'controller', isPublic: false });
    expect(byKey.get('POST /v1/auth/code')).toMatchObject({ source: 'controller', isPublic: true });
    expect(byKey.get('POST /v1/ping')).toMatchObject({ source: 'controller', isPublic: false });
    expect(byKey.get('GET /docs')).toMatchObject({ source: 'http-adapter', isPublic: true });
  });
});

describe('route registry check', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await createScratchDatabase({ migrate: false });
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  it('reports a registered route that has neither a fixture nor an allowlist entry', async () => {
    const harness = await createCrossTenantApp(db, [PingModule, ThrowawayModule], {
      tenants: false,
    });
    try {
      const problems = checkRouteRegistry(listRoutes(harness.app), ROUTE_FIXTURES, ROUTE_ALLOWLIST);
      expect(problems).toEqual([
        expect.stringMatching(
          /^GET \/v1\/throwaway\/:id has no cross-tenant fixture .*route-fixtures\.ts.*route-allowlist\.ts/,
        ),
      ]);
    } finally {
      await harness.close();
    }
  });

  it('passes for the kernel routes plus the ping fixture module', async () => {
    const harness = await createCrossTenantApp(db, [PingModule], { tenants: false });
    try {
      expect(checkRouteRegistry(listRoutes(harness.app), ROUTE_FIXTURES, ROUTE_ALLOWLIST)).toEqual(
        [],
      );
    } finally {
      await harness.close();
    }
  });

  it('reports fixture and allowlist entries for routes that no longer exist', async () => {
    const harness = await createCrossTenantApp(db, [], { tenants: false });
    try {
      const problems = checkRouteRegistry(
        listRoutes(harness.app),
        { ...ROUTE_FIXTURES, 'GET /v1/gone/:id': {} },
        { ...ROUTE_ALLOWLIST, 'DELETE /v1/gone': { reason: 'caller-scoped', note: 'gone' } },
      );
      expect(problems).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^Fixture "GET \/v1\/gone\/:id" .*not a registered route/),
          expect.stringMatching(/^Fixture "GET \/v1\/ping" .*not a registered route/),
          expect.stringMatching(/^Fixture "POST \/v1\/ping" .*not a registered route/),
          expect.stringMatching(/^Allowlist entry "DELETE \/v1\/gone" .*not a registered route/),
        ]),
      );
      expect(problems).toHaveLength(4);
    } finally {
      await harness.close();
    }
  });

  it('reports a route that is on both lists, and a "public" entry for a route that needs auth', () => {
    const routes = [
      { key: 'GET /v1/a', method: 'GET', path: '/v1/a', source: 'controller', isPublic: false },
      { key: 'GET /v1/b', method: 'GET', path: '/v1/b', source: 'controller', isPublic: false },
    ] as const;
    const fixtures: RouteFixtures = { 'GET /v1/a': {} };
    const allowlist: RouteAllowlist = {
      'GET /v1/a': { reason: 'caller-scoped', note: 'x' },
      'GET /v1/b': { reason: 'public', note: 'x' },
    };

    expect(checkRouteRegistry(routes, fixtures, allowlist)).toEqual([
      expect.stringMatching(/^GET \/v1\/a has both a fixture and an allowlist entry/),
      expect.stringMatching(/^GET \/v1\/b is allowlisted as public but is not @Public\(\)/),
    ]);
  });
});

describe('runRouteFixture', () => {
  let db: ScratchDatabase;
  let harness: CrossTenantApp;

  beforeAll(async () => {
    db = await createScratchDatabase();
    harness = await createCrossTenantApp(db, [PingModule, HarnessProbeModule]);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await db?.drop();
  });

  it("runs the POST /v1/ping fixture: B with the same Idempotency-Key gets its own ping, not A's replay", async () => {
    const res = await runRouteFixture(
      harness.context,
      'POST /v1/ping',
      fixtureFor('POST /v1/ping'),
    );

    expect(res.status).toBe(StatusCodes.CREATED);
    expect(res.body).toEqual({ id: expect.any(String), version: 1 });
  });

  it('runs the GET /v1/ping fixture', async () => {
    const res = await runRouteFixture(harness.context, 'GET /v1/ping', fixtureFor('GET /v1/ping'));

    expect(res.status).toBe(StatusCodes.OK);
  });

  it('expects 403 or 404 by default and passes for a route that hides the resource', async () => {
    const res = await runRouteFixture(harness.context, 'GET /v1/harness/hidden/:id', {
      setup: async () => ({ params: { id: randomUUID() } }),
    });

    expect(res.status).toBe(StatusCodes.NOT_FOUND);
  });

  it('fails when B gets a success status from a route without an expect override', async () => {
    await expect(
      runRouteFixture(harness.context, 'GET /v1/harness/open/:id', {
        setup: async () => ({ params: { id: randomUUID() } }),
      }),
    ).rejects.toThrow(/GET \/v1\/harness\/open\/:id as school B: expected 403 or 404, got 200/);
  });

  it("fails when B's response contains an id returned by A's setup", async () => {
    const aId = randomUUID();
    await expect(
      runRouteFixture(harness.context, 'GET /v1/harness/leaky', {
        setup: async () => {
          leakedIds.push(aId);
          return { aIds: [aId] };
        },
        expect: (res) => expect(res.status).toBe(StatusCodes.OK),
      }),
    ).rejects.toThrow(
      new RegExp(`GET /v1/harness/leaky as school B: response contains A's id ${aId}`),
    );
  });

  it("fails when B's response contains A's school id even without setup ids", async () => {
    leakedIds.push(harness.context.A.schoolId);
    try {
      await expect(
        runRouteFixture(harness.context, 'GET /v1/harness/leaky', {
          expect: (res) => expect(res.status).toBe(StatusCodes.OK),
        }),
      ).rejects.toThrow(/response contains A's id/);
    } finally {
      leakedIds.length = 0;
    }
  });

  it('treats path params from setup as A ids, so error bodies must not echo them', async () => {
    const id = randomUUID();
    await expect(
      runRouteFixture(harness.context, 'GET /v1/harness/echo/:id', {
        setup: async () => ({ params: { id } }),
      }),
    ).rejects.toThrow(new RegExp(`response contains A's id ${id}`));
  });

  it('fails when setup leaves a path param unresolved', async () => {
    await expect(
      runRouteFixture(harness.context, 'GET /v1/harness/hidden/:id', {}),
    ).rejects.toThrow(/GET \/v1\/harness\/hidden\/:id: setup returned no value for path param :id/);
  });

  it('gives setup a context with A, B, a supertest agent and tenant helpers', async () => {
    let seen: unknown;
    await runRouteFixture(harness.context, 'POST /v1/harness/things', {
      setup: async (ctx) => {
        const created = await ctx.request.post('/v1/harness/things').set(ctx.auth(ctx.A));
        const school = await ctx.tenants.asSchool(ctx.A, async () => ctx.A.schoolId);
        seen = { status: created.status, school, differs: ctx.A.schoolId !== ctx.B.schoolId };
        return { aIds: [created.body.id] };
      },
      expect: (res) => expect(res.status).toBe(StatusCodes.CREATED),
    });

    expect(seen).toEqual({
      status: StatusCodes.CREATED,
      school: harness.context.A.schoolId,
      differs: true,
    });
  });

  it('expectListResponse accepts a 200 list response and rejects anything else', async () => {
    const res = await runRouteFixture(harness.context, 'GET /v1/harness/leaky', {
      expect: expectListResponse('ids'),
    });
    expect(res.body).toEqual({ ids: [] });

    await expect(
      runRouteFixture(harness.context, 'GET /v1/harness/leaky', {
        expect: expectListResponse(),
      }),
    ).rejects.toThrow();
  });
});

describe('placeholderParams', () => {
  it('fills every path param with a fresh uuid', () => {
    const params = placeholderParams('/v1/students/:id/guardians/:linkId');

    expect(Object.keys(params)).toEqual(['id', 'linkId']);
    for (const value of Object.values(params)) expect(value).toMatch(/^[0-9a-f-]{36}$/);
    expect(placeholderParams('/v1/health')).toEqual({});
  });
});
