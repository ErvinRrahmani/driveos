import { Controller, Get, Module } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { listRoutes, type RegisteredRoute } from '../support/cross-tenant.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { PERMISSION_ALLOWLIST, undeclaredRoutes } from '../support/permission-allowlist.js';

@Controller('undeclared')
class UndeclaredController {
  @Get()
  list(): [] {
    return [];
  }
}

@Module({ controllers: [UndeclaredController] })
class UndeclaredModule {}

describe('every authenticated route declares a permission', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let routes: RegisteredRoute[];

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    routes = listRoutes(kernel.app);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  it('declares @RequirePermission on every non-public route of the app, or allowlists it', () => {
    const problems = undeclaredRoutes(routes, PERMISSION_ALLOWLIST);
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });

  it('sees the identity permission declarations', () => {
    const byKey = new Map(routes.map((route) => [route.key, route.permissions]));
    expect(byKey.get('POST /v1/invitations')).toEqual({
      mode: 'all',
      permissions: ['invitations.manage'],
    });
    expect(byKey.get('PATCH /v1/memberships/:id')?.permissions).toEqual(['memberships.manage']);
  });

  it('reports a route without a declaration, and stale allowlist entries', () => {
    const extra: RegisteredRoute = {
      key: 'GET /v1/undeclared',
      method: 'GET',
      path: '/v1/undeclared',
      source: 'controller',
      isPublic: false,
    };
    expect(
      undeclaredRoutes([...routes, extra], { ...PERMISSION_ALLOWLIST, 'GET /v1/gone': {} }),
    ).toEqual([
      expect.stringMatching(/^GET \/v1\/undeclared declares no @RequirePermission/),
      'GET /v1/gone is on the permission allowlist but not registered',
    ]);
  });

  it('finds an undeclared controller route in a real app', async () => {
    const app = await createKernelTestApp(db, [UndeclaredModule]);
    try {
      expect(undeclaredRoutes(listRoutes(app.app), PERMISSION_ALLOWLIST)).toEqual([
        expect.stringMatching(/^GET \/v1\/undeclared declares no @RequirePermission/),
      ]);
    } finally {
      await app.close();
    }
  });
});
