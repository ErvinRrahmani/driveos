import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureHttpApp } from '../../src/http-app.js';
import { ApiError } from '../../src/kernel/http/api-error.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { StatusCodes } from 'http-status-codes';

const rolledBackBranchId = randomUUID();

@Controller('probe')
class ProbeController {
  constructor(private readonly tenant: TenantContext) {}

  @Get('settings')
  async settings(): Promise<{ schoolId: string | null; userId: string | null }> {
    const result = await this.tenant.tx.execute<{ school_id: string; user_id: string }>(
      sql`select current_setting('app.school_id', true) as school_id,
        current_setting('app.user_id', true) as user_id`,
    );
    const row = result.rows[0];
    return { schoolId: row?.school_id || null, userId: row?.user_id || null };
  }

  @Get('branches')
  async branches(): Promise<string[]> {
    const result = await this.tenant.tx.execute<{ school_id: string }>(
      sql`select distinct school_id from branches order by school_id`,
    );
    return result.rows.map((row) => row.school_id);
  }

  @Post('fail')
  async fail(): Promise<never> {
    await this.tenant.tx.execute(sql`insert into branches (id, school_id, name, address, lat, lng)
      values (${rolledBackBranchId}, ${this.tenant.schoolId}, 'Rolled back', 'x', 0, 0)`);
    throw new ApiError(StatusCodes.CONFLICT, 'probe_failed', 'Probe failed on purpose.');
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('tenant transaction per HTTP request (test-only dev auth headers)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let schoolA: SchoolFixture;
  let schoolB: SchoolFixture;
  let app: INestApplication;

  const as = (school: SchoolFixture) => ({
    'X-Dev-School': school.schoolId,
    'X-Dev-User': school.ownerUserId,
  });

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    schoolA = await createSchoolFixture(system);
    schoolB = await createSchoolFixture(system);
    vi.stubEnv('DATABASE_URL', db.appUrl);
    vi.stubEnv('DATABASE_SYSTEM_URL', db.systemUrl);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ envFilePath: ['.env.example'] }), ProbeModule],
    }).compile();
    app = configureHttpApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    await system?.end();
    await db?.drop();
  });

  it('runs the handler with the settings of the tenant transaction', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/probe/settings')
      .set(as(schoolA))
      .expect(StatusCodes.OK);
    expect(res.body).toEqual({ schoolId: schoolA.schoolId, userId: schoolA.ownerUserId });
  });

  it('reports no school for an empty X-Dev-School', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/probe/settings')
      .set({ 'X-Dev-School': '', 'X-Dev-User': schoolA.ownerUserId })
      .expect(StatusCodes.OK);
    expect(res.body).toEqual({ schoolId: null, userId: schoolA.ownerUserId });
  });

  it('answers 401 unauthenticated without the dev headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/probe/settings')
      .expect(StatusCodes.UNAUTHORIZED);
    expect(res.body).toEqual({
      error: { code: 'unauthenticated', message: 'Authentication is required.' },
    });
  });

  it('answers 401 when the dev headers are malformed', async () => {
    await request(app.getHttpServer())
      .get('/v1/probe/settings')
      .set({ 'X-Dev-School': 'not-a-uuid', 'X-Dev-User': schoolA.ownerUserId })
      .expect(StatusCodes.UNAUTHORIZED);
  });

  it("a request for school A reads only A's rows from a tenant table", async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/probe/branches')
      .set(as(schoolA))
      .expect(StatusCodes.OK);
    expect(resA.body).toEqual([schoolA.schoolId]);
    const resB = await request(app.getHttpServer())
      .get('/v1/probe/branches')
      .set(as(schoolB))
      .expect(StatusCodes.OK);
    expect(resB.body).toEqual([schoolB.schoolId]);
  });

  it('rolls back the request transaction when the handler fails', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/probe/fail')
      .set(as(schoolA))
      .expect(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('probe_failed');
    const found = await system.query('select 1 from branches where id = $1', [rolledBackBranchId]);
    expect(found.rowCount).toBe(0);
  });

  it('keeps /v1/health public', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(StatusCodes.OK);
  });
});
