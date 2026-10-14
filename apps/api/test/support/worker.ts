import { randomBytes } from 'node:crypto';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { vi } from 'vitest';
import { EMAIL_SENDER } from '../../src/adapters/email/email-sender.js';
import { FakeEmailSender } from '../../src/adapters/email/fake-email-sender.js';
import { FakePushSender } from '../../src/adapters/push/fake-push-sender.js';
import { PUSH_SENDER } from '../../src/adapters/push/push-sender.js';
import { FakeSmsSender } from '../../src/adapters/sms/fake-sms-sender.js';
import { SMS_SENDER } from '../../src/adapters/sms/sms-sender.js';
import { FakeObjectStorage } from '../../src/adapters/storage/fake-object-storage.js';
import { OBJECT_STORAGE } from '../../src/adapters/storage/object-storage.js';
import { EventPublisher } from '../../src/kernel/cqrs/index.js';
import { JobQueues, QUEUES } from '../../src/kernel/jobs/index.js';
import {
  DeliveryReconciler,
  OutboxRelay,
  type ReconcileResult,
  type RelayResult,
} from '../../src/kernel/outbox/index.js';
import { EventsWorker } from '../../src/kernel/subscribers/index.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { WorkerLifecycle } from '../../src/kernel/worker/worker-lifecycle.js';
import { WorkerModule } from '../../src/worker.module.js';
import type { ScratchDatabase } from '../db/scratch-database.js';
import { deleteKeys } from './redis.js';

export interface DrainResult {
  relayed: number;
  completed: number;
  failed: number;
}

export interface DrainOptions {
  concurrency?: number;
  timeoutMs?: number;
}

export interface ProviderOverride {
  provide: unknown;
  useValue: unknown;
}

export interface WorkerTestHarness {
  app: INestApplicationContext;
  prefix: string;
  tenant: TenantContext;
  publisher: EventPublisher;
  storage: FakeObjectStorage;
  sms: FakeSmsSender;
  email: FakeEmailSender;
  push: FakePushSender;
  runRelayOnce(): Promise<RelayResult>;
  runReconcilerOnce(now?: Date): Promise<ReconcileResult>;
  drainWorker(options?: DrainOptions): Promise<DrainResult>;
  jobIds(): Promise<string[]>;
  close(): Promise<void>;
}

const PENDING_STATES = ['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'] as const;

export async function createWorkerTestHarness(
  db: ScratchDatabase,
  modules: Type[] = [],
  env: Record<string, string> = {},
  overrides: ProviderOverride[] = [],
): Promise<WorkerTestHarness> {
  const prefix = `driveos-test-${randomBytes(6).toString('hex')}`;
  const settings: Record<string, string> = {
    DATABASE_URL: db.appUrl,
    DATABASE_SYSTEM_URL: db.systemUrl,
    JOBS_PREFIX: prefix,
    EVENT_BACKOFF_DELAY_MS: '1',
    EVENT_BACKOFF_MAX_MS: '20',
    ...env,
  };
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  const storage = new FakeObjectStorage();
  const sms = new FakeSmsSender();
  const email = new FakeEmailSender();
  const push = new FakePushSender();
  let builder = Test.createTestingModule({
    imports: [WorkerModule.forRoot({ envFilePath: ['.env.example'] }), ...modules],
  })
    .overrideProvider(WorkerLifecycle)
    .useValue({})
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .overrideProvider(SMS_SENDER)
    .useValue(sms)
    .overrideProvider(EMAIL_SENDER)
    .useValue(email)
    .overrideProvider(PUSH_SENDER)
    .useValue(push);
  for (const { provide, useValue } of overrides) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  moduleRef.useLogger(moduleRef.get(Logger));
  const app = await moduleRef.init();
  const redisUrl = app.get(ConfigService).getOrThrow<string>('REDIS_URL');
  const queues = app.get(JobQueues);
  const relay = app.get(OutboxRelay);
  const events = app.get(EventsWorker);
  const eventsQueue = queues.queue(QUEUES.events);

  const pending = async () => {
    const counts = await eventsQueue.getJobCounts(...PENDING_STATES);
    return Object.values(counts).reduce((sum, n) => sum + n, 0);
  };

  const drainWorker = async (options: DrainOptions = {}): Promise<DrainResult> => {
    const deadline = Date.now() + (options.timeoutMs ?? 20_000);
    const result: DrainResult = { relayed: 0, completed: 0, failed: 0 };
    const worker = events.start({ concurrency: options.concurrency ?? 1 });
    worker.on('completed', () => (result.completed += 1));
    worker.on('failed', () => (result.failed += 1));
    try {
      for (;;) {
        const relayed = await relay.relayUntilEmpty();
        result.relayed += relayed.events;
        while ((await pending()) > 0) {
          if (Date.now() > deadline) throw new Error('drainWorker timed out');
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        if (relayed.events === 0) return result;
      }
    } finally {
      await events.stop();
    }
  };

  return {
    app,
    prefix,
    tenant: app.get(TenantContext),
    publisher: app.get(EventPublisher),
    storage,
    sms,
    email,
    push,
    runRelayOnce: () => relay.relayOnce(),
    runReconcilerOnce: (now) => app.get(DeliveryReconciler).reconcileOnce(now),
    drainWorker,
    jobIds: async () =>
      (await eventsQueue.getJobs([...PENDING_STATES, 'failed', 'completed']))
        .map((job) => job.id ?? '')
        .sort(),
    close: async () => {
      try {
        await app.close();
      } finally {
        await deleteKeys(redisUrl, prefix);
        vi.unstubAllEnvs();
      }
    },
  };
}
