import { randomBytes } from 'node:crypto';
import type { INestApplication, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { EMAIL_SENDER } from '../../src/adapters/email/email-sender.js';
import { FakeEmailSender } from '../../src/adapters/email/fake-email-sender.js';
import { FakeSmsSender } from '../../src/adapters/sms/fake-sms-sender.js';
import { SMS_SENDER } from '../../src/adapters/sms/sms-sender.js';
import { FakeObjectStorage } from '../../src/adapters/storage/fake-object-storage.js';
import { OBJECT_STORAGE } from '../../src/adapters/storage/object-storage.js';
import { configureHttpApp } from '../../src/http-app.js';
import type { ScratchDatabase } from '../db/scratch-database.js';
import { deleteKeys } from './redis.js';

export interface KernelTestApp {
  app: INestApplication;
  sms: FakeSmsSender;
  email: FakeEmailSender;
  storage: FakeObjectStorage;
  redisPrefix: string;
  close(): Promise<void>;
}

export interface KernelTestAppOptions {
  env?: Record<string, string>;
}

export async function createKernelTestApp(
  db: ScratchDatabase,
  modules: Type[] = [],
  options: KernelTestAppOptions = {},
): Promise<KernelTestApp> {
  const redisPrefix = `driveos-test-${randomBytes(6).toString('hex')}`;
  const settings: Record<string, string> = {
    DATABASE_URL: db.appUrl,
    DATABASE_SYSTEM_URL: db.systemUrl,
    JOBS_PREFIX: redisPrefix,
    ...options.env,
  };
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  const sms = new FakeSmsSender();
  const email = new FakeEmailSender();
  const storage = new FakeObjectStorage();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ envFilePath: ['.env.example'] }), ...modules],
  })
    .overrideProvider(SMS_SENDER)
    .useValue(sms)
    .overrideProvider(EMAIL_SENDER)
    .useValue(email)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ bufferLogs: true, rawBody: true }),
  );
  await app.init();
  const redisUrl = app.get(ConfigService).getOrThrow<string>('REDIS_URL');
  return {
    app,
    sms,
    email,
    storage,
    redisPrefix,
    close: async () => {
      try {
        await app.close();
      } finally {
        await deleteKeys(redisUrl, redisPrefix);
        vi.unstubAllEnvs();
      }
    },
  };
}

export function devAuth(schoolId: string | null, userId: string): Record<string, string> {
  return { 'X-Dev-School': schoolId ?? '', 'X-Dev-User': userId };
}
