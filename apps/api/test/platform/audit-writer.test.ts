import { randomUUID } from 'node:crypto';
import { Controller, Get, Inject, Module, Param } from '@nestjs/common';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { RequirePermission } from '../../src/modules/identity/index.js';
import { AUDIT_WRITER, type AuditWriter } from '../../src/modules/platform/index.js';
import { PlatformModule } from '../../src/modules/platform/platform.module.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { StatusCodes } from 'http-status-codes';

@Controller('audit-probe')
class AuditProbeController {
  constructor(@Inject(AUDIT_WRITER) private readonly audit: AuditWriter) {}

  @Get(':id')
  @RequirePermission('school.read')
  async read(@Param('id') id: string): Promise<{ ok: true }> {
    await this.audit.record({ action: 'probe.read', targetType: 'probe', targetId: id });
    return { ok: true };
  }
}

@Module({ imports: [PlatformModule], controllers: [AuditProbeController] })
class AuditProbeModule {}

describe('AuditWriter', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  const adminId = randomUUID();

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db, [AuditProbeModule]);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    A = tenants.A;
    http = request(kernel.app.getHttpServer());
    await system.query(
      `insert into users (id, full_name, email, locale) values ($1, 'Pat Platform', $2, 'en')`,
      [adminId, `pat.${adminId}@example.com`],
    );
    await system.query(`insert into platform_admins (user_id) values ($1)`, [adminId]);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const entryFor = async (targetId: string) =>
    (
      await system.query(
        `select school_id, actor_user_id, support_session_id, action, target_type
           from audit_log where target_id = $1`,
        [targetId],
      )
    ).rows;

  it('writes the school and actor of the request, without a support session', async () => {
    const target = randomUUID();
    await http.get(`/v1/audit-probe/${target}`).set(authHeaders(A)).expect(StatusCodes.OK);
    expect(await entryFor(target)).toEqual([
      {
        school_id: A.schoolId,
        actor_user_id: A.ownerUserId,
        support_session_id: null,
        action: 'probe.read',
        target_type: 'probe',
      },
    ]);
  });

  it('adds the support session id when a support token makes the request', async () => {
    const started = await http
      .post('/v1/platform/support-sessions')
      .set(authHeadersFor(null, { userId: adminId, roles: ['platform_admin'] }))
      .send({ schoolId: A.schoolId, reason: 'probe' })
      .expect(StatusCodes.CREATED);
    const target = randomUUID();
    await http
      .get(`/v1/audit-probe/${target}`)
      .set({ Authorization: `Bearer ${started.body.supportToken as string}` })
      .expect(StatusCodes.OK);
    const rows = await entryFor(target);
    expect(rows).toEqual([
      expect.objectContaining({ action: 'GET /v1/audit-probe/:id', target_type: 'route' }),
      expect.objectContaining({
        action: 'probe.read',
        school_id: A.schoolId,
        actor_user_id: adminId,
        support_session_id: started.body.id,
      }),
    ]);
  });
});
