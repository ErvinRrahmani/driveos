import { randomUUID } from 'node:crypto';
import { Controller, HttpCode, Module, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommandBus, type CommandResult } from '../../src/kernel/cqrs/index.js';
import { Idempotent } from '../../src/kernel/idempotency/idempotent.decorator.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { PingModule, RecordPingCommand } from '../fixtures/ping/index.js';
import { createKernelTestApp, devAuth, type KernelTestApp } from '../support/kernel-app.js';
import { StatusCodes } from 'http-status-codes';

@Controller('probe')
class SlowProbeController {
  constructor(
    private readonly tenant: TenantContext,
    private readonly commandBus: CommandBus,
  ) {}

  @Post('slow')
  @Idempotent()
  async slow(): Promise<CommandResult> {
    await this.tenant.tx.execute(sql`select pg_sleep(0.3)`);
    return this.commandBus.execute(new RecordPingCommand('slow'));
  }

  @Post('accepted')
  @HttpCode(StatusCodes.ACCEPTED)
  @Idempotent()
  accepted(): Promise<CommandResult> {
    return this.commandBus.execute(new RecordPingCommand('accepted'));
  }
}

@Module({ controllers: [SlowProbeController] })
class SlowProbeModule {}

interface StoredKey {
  school_id: string;
  key: string;
  endpoint: string;
  request_hash: string;
  response_status: number;
  response_body: unknown;
}

describe('@Idempotent() on POST /v1/ping (ping fixture)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let schoolA: SchoolFixture;
  let schoolB: SchoolFixture;
  let kernel: KernelTestApp;

  const http = () => request(kernel.app.getHttpServer());
  const asA = () => devAuth(schoolA.schoolId, schoolA.ownerUserId);
  const asB = () => devAuth(schoolB.schoolId, schoolB.ownerUserId);

  const pings = async () =>
    Number(
      (await system.query("select count(*) as n from outbox where type = 'PingRecorded'")).rows[0]
        .n,
    );
  const storedKeys = async () =>
    (await system.query<StoredKey>('select * from idempotency_keys order by created_at')).rows;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    schoolA = await createSchoolFixture(system);
    schoolB = await createSchoolFixture(system);
    kernel = await createKernelTestApp(db, [PingModule, SlowProbeModule]);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    await system.query('delete from outbox');
    await system.query('delete from idempotency_keys');
  });

  it('requires the Idempotency-Key header', async () => {
    const res = await http()
      .post('/v1/ping')
      .set(asA())
      .send({ message: 'hi' })
      .expect(StatusCodes.BAD_REQUEST);
    expect(res.body).toEqual({
      error: {
        code: 'idempotency_key_required',
        message: 'This request requires an Idempotency-Key header.',
      },
    });
    expect(await pings()).toBe(0);
  });

  it('rejects a key longer than 255 characters', async () => {
    const res = await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', 'k'.repeat(256))
      .send({ message: 'hi' })
      .expect(StatusCodes.BAD_REQUEST);
    expect(res.body.error.code).toBe('idempotency_key_invalid');
    expect(await pings()).toBe(0);
  });

  it('runs the handler once and stores the response with the write', async () => {
    const key = randomUUID();
    const res = await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: 'hi' })
      .expect(StatusCodes.CREATED);

    expect(res.body).toEqual({ id: expect.any(String), version: 1 });
    expect(await pings()).toBe(1);
    expect(await storedKeys()).toEqual([
      {
        school_id: schoolA.schoolId,
        key,
        endpoint: 'POST /v1/ping',
        request_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        response_status: StatusCodes.CREATED,
        response_body: res.body,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      },
    ]);
  });

  it('replays the stored response for the same key and body without running the handler', async () => {
    const key = randomUUID();
    const first = await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: 'hi' })
      .expect(StatusCodes.CREATED);

    const replay = await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: 'hi' })
      .expect(StatusCodes.CREATED);

    expect(replay.body).toEqual(first.body);
    expect(await pings()).toBe(1);
  });

  it('replays the stored status code', async () => {
    const key = randomUUID();
    const first = await http()
      .post('/v1/probe/accepted')
      .set(asA())
      .set('Idempotency-Key', key)
      .expect(StatusCodes.ACCEPTED);
    await http()
      .post('/v1/probe/accepted')
      .set(asA())
      .set('Idempotency-Key', key)
      .expect(StatusCodes.ACCEPTED, first.body);
    expect(await pings()).toBe(1);
  });

  it('answers 422 idempotency_key_reused for the same key with a different body', async () => {
    const key = randomUUID();
    await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: 'hi' })
      .expect(StatusCodes.CREATED);

    const res = await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: 'something else' })
      .expect(StatusCodes.UNPROCESSABLE_ENTITY);

    expect(res.body).toEqual({
      error: {
        code: 'idempotency_key_reused',
        message: 'This Idempotency-Key was already used for a different request.',
      },
    });
    expect(await pings()).toBe(1);
  });

  it('answers 422 for the same key on a different endpoint', async () => {
    const key = randomUUID();
    await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: 'hi' })
      .expect(StatusCodes.CREATED);
    await http()
      .post('/v1/probe/accepted')
      .set(asA())
      .set('Idempotency-Key', key)
      .expect(StatusCodes.UNPROCESSABLE_ENTITY);
  });

  it('scopes keys per school', async () => {
    const key = randomUUID();
    const a = await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: 'hi' })
      .expect(StatusCodes.CREATED);
    const b = await http()
      .post('/v1/ping')
      .set(asB())
      .set('Idempotency-Key', key)
      .send({ message: 'hi' })
      .expect(StatusCodes.CREATED);

    expect(b.body.id).not.toBe(a.body.id);
    expect(await pings()).toBe(2);
  });

  it('stores nothing when the request fails, so a corrected retry with the same key runs', async () => {
    const key = randomUUID();
    await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: '' })
      .expect(StatusCodes.BAD_REQUEST);
    expect(await storedKeys()).toEqual([]);

    await http()
      .post('/v1/ping')
      .set(asA())
      .set('Idempotency-Key', key)
      .send({ message: 'fixed' })
      .expect(StatusCodes.CREATED);
    expect(await pings()).toBe(1);
  });

  it('runs the handler once for two parallel identical requests', async () => {
    const key = randomUUID();
    const send = () => http().post('/v1/probe/slow').set(asA()).set('Idempotency-Key', key);

    const [first, second] = await Promise.all([send(), send()]);

    expect([first.status, second.status]).toEqual([StatusCodes.CREATED, StatusCodes.CREATED]);
    expect(second.body).toEqual(first.body);
    expect(await pings()).toBe(1);
  });

  it('requires a school', async () => {
    const res = await http()
      .post('/v1/ping')
      .set(devAuth(null, schoolA.ownerUserId))
      .set('Idempotency-Key', randomUUID())
      .send({ message: 'hi' })
      .expect(StatusCodes.FORBIDDEN);
    expect(res.body.error.code).toBe('school_required');
  });

  it('leaves routes without @Idempotent() alone', async () => {
    await http().get('/v1/ping').set(asA()).expect(StatusCodes.OK, { count: 0 });
  });

  it('documents the required Idempotency-Key header in OpenAPI', async () => {
    const res = await http().get('/docs-json').expect(StatusCodes.OK);
    expect(res.body.paths['/v1/ping'].post.parameters).toContainEqual(
      expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
    );
    expect(res.body.paths['/v1/ping'].get.parameters ?? []).toEqual([]);
  });
});
