import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertMonitor, AlertStore, ALERTS_JOB } from '../../src/kernel/alerts/index.js';
import { ScheduledJobs } from '../../src/kernel/jobs/index.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { authHeadersFor } from '../support/tenants.js';
import { createWorkerTestHarness, type WorkerTestHarness } from '../support/worker.js';

const MINUTES_AGO = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe('platform.alerts', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let harness: WorkerTestHarness;
  let monitor: AlertMonitor;
  let warn: { mock: { calls: unknown[][] }; mockRestore(): void } | undefined;

  const outboxRow = async (type: string, occurredAt: Date, publishedAt: Date | null) => {
    const id = randomUUID();
    await system.query(
      `insert into outbox (id, school_id, type, version, aggregate_type, aggregate_id,
                           aggregate_version, occurred_at, payload, published_at)
       values ($1, $2, $3, 1, 'test', $4, 1, $5, '{}', $6)`,
      [id, school.schoolId, type, randomUUID(), occurredAt, publishedAt],
    );
    return id;
  };

  const evaluate = async () => (await monitor.evaluateOnce(new Date())).items;
  const names = async () => (await evaluate()).map((item) => item.alert);
  const transitions = () =>
    (warn?.mock.calls ?? [])
      .map((args) => args[0] as { alert?: string; state?: string })
      .filter((entry) => entry.alert !== undefined)
      .map((entry) => `${entry.alert}:${entry.state}`);

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    harness = await createWorkerTestHarness(db, [], {
      ALERT_OUTBOX_LAG_SECONDS: '60',
      ALERT_SYNC_BACKLOG_SECONDS: '60',
    });
    monitor = harness.app.get(AlertMonitor);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await system?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    for (const table of [
      'event_deliveries',
      'dead_letters',
      'outbox',
      'payment_webhook_failures',
    ]) {
      await system.query(`delete from ${table}`);
    }
    await harness.app.get(AlertStore).replace({ items: [], evaluatedAt: null });
    warn = vi.spyOn(Logger.prototype, 'warn');
  });

  afterEach(() => {
    warn?.mockRestore();
  });

  it('registers the job every 60 s with the four probes', () => {
    const job = harness.app
      .get(ScheduledJobs)
      .list()
      .find((definition) => definition.name === ALERTS_JOB);
    expect(job?.every).toBe(60_000);
  });

  it('raises nothing when all is well', async () => {
    await outboxRow('PingRecorded', MINUTES_AGO(0), null);
    expect(await evaluate()).toEqual([]);
    expect(transitions()).toEqual([]);
  });

  it('raises outbox_lag for an unpublished row older than 60 s, once, and clears it', async () => {
    const id = await outboxRow('PingRecorded', MINUTES_AGO(5), null);

    const [alert] = await evaluate();
    expect(alert).toMatchObject({ alert: 'outbox_lag', threshold: 60, schoolId: school.schoolId });
    expect(alert?.value).toBeGreaterThanOrEqual(299);
    await evaluate();
    expect(transitions()).toEqual(['outbox_lag:raised']);

    await system.query('update outbox set published_at = now() where id = $1', [id]);
    expect(await evaluate()).toEqual([]);
    expect(transitions()).toEqual(['outbox_lag:raised', 'outbox_lag:cleared']);
  });

  it('raises dead_letters for a parked delivery and clears it when the row is gone', async () => {
    const eventId = await outboxRow('PingRecorded', MINUTES_AGO(0), new Date());
    await system.query(
      `insert into dead_letters (id, subscriber, event_id, error, attempts, failed_at)
       values ($1, 'test.subscriber', $2, 'boom', 10, now())`,
      [randomUUID(), eventId],
    );

    expect(await evaluate()).toEqual([
      expect.objectContaining({
        alert: 'dead_letters',
        value: 1,
        threshold: 0,
        schoolId: school.schoolId,
      }),
    ]);
    await evaluate();

    await system.query('delete from dead_letters');
    expect(await names()).toEqual([]);
    expect(transitions()).toEqual(['dead_letters:raised', 'dead_letters:cleared']);
  });

  it('raises webhook_failures for a failure in the last 15 minutes only', async () => {
    await system.query(
      `insert into payment_webhook_failures (id, school_id, provider, reason, failed_at)
       values ($1, null, 'fake', 'invalid_signature', $2)`,
      [randomUUID(), MINUTES_AGO(20)],
    );
    expect(await names()).toEqual([]);

    const recent = randomUUID();
    await system.query(
      `insert into payment_webhook_failures (id, school_id, provider, reason, failed_at)
       values ($1, null, 'fake', 'invalid_signature', $2)`,
      [recent, MINUTES_AGO(1)],
    );
    expect(await evaluate()).toEqual([
      expect.objectContaining({ alert: 'webhook_failures', value: 1, threshold: 0 }),
    ]);

    await system.query('delete from payment_webhook_failures where id = $1', [recent]);
    expect(await names()).toEqual([]);
    expect(transitions()).toEqual(['webhook_failures:raised', 'webhook_failures:cleared']);
  });

  it('raises sync_backlog when the change feed has not applied an event for over 60 s', async () => {
    const eventId = await outboxRow('LessonBooked', MINUTES_AGO(3), MINUTES_AGO(3));
    await outboxRow('PingRecorded', MINUTES_AGO(3), MINUTES_AGO(3));

    const [alert] = await evaluate();
    expect(alert).toMatchObject({ alert: 'sync_backlog', schoolId: school.schoolId });
    expect(alert?.value).toBeGreaterThanOrEqual(179);

    await system.query(
      `insert into event_deliveries (subscriber, event_id, delivered_at)
       values ('scheduling.change-feed', $1, now())`,
      [eventId],
    );
    expect(await names()).toEqual([]);
    expect(transitions()).toEqual(['sync_backlog:raised', 'sync_backlog:cleared']);
  });

  it('keeps the first-seen time while an alert stays raised and stores the set in Redis', async () => {
    await outboxRow('PingRecorded', MINUTES_AGO(5), null);
    const first = await monitor.evaluateOnce(new Date('2030-01-01T00:00:00.000Z'));
    const second = await monitor.evaluateOnce(new Date('2030-01-01T00:01:00.000Z'));

    expect(second.items[0]?.since).toBe(first.items[0]?.since);
    expect(await harness.app.get(AlertStore).current()).toEqual(second);
  });
});

describe('GET /v1/platform/alerts and webhook failure records', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let kernel: KernelTestApp;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    kernel = await createKernelTestApp(db);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  it('returns the stored alert set to a platform admin and 403 to a school owner', async () => {
    const state = {
      items: [
        {
          alert: 'outbox_lag' as const,
          value: 95,
          threshold: 60,
          schoolId: school.schoolId,
          since: '2026-10-01T08:00:00.000Z',
        },
      ],
      evaluatedAt: '2026-10-01T08:01:00.000Z',
    };
    await kernel.app.get(AlertStore).replace(state);
    const http = request(kernel.app.getHttpServer());

    const admin = await http
      .get('/v1/platform/alerts')
      .set(authHeadersFor(null, { roles: ['platform_admin'], userId: randomUUID() }));
    expect(admin.status).toBe(StatusCodes.OK);
    expect(admin.body).toEqual(state);

    const owner = await http
      .get('/v1/platform/alerts')
      .set(
        authHeadersFor(
          { schoolId: school.schoolId, ownerUserId: school.ownerUserId },
          { roles: ['owner'], membershipId: randomUUID() },
        ),
      );
    expect(owner.status).toBe(StatusCodes.FORBIDDEN);
  });

  it('records a rejected payment webhook without a school', async () => {
    const res = await request(kernel.app.getHttpServer())
      .post('/v1/webhooks/payments/fake')
      .set('Content-Type', 'application/json')
      .send({ type: 'payment.succeeded', providerRef: 'pi_forged' });
    expect(res.status).toBe(StatusCodes.UNAUTHORIZED);

    const { rows } = await system.query(
      'select school_id, provider, reason from payment_webhook_failures',
    );
    expect(rows).toEqual([{ school_id: null, provider: 'fake', reason: 'invalid_signature' }]);
  });
});
