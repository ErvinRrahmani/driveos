import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { AppConfigOptions } from './kernel/config/config.module.js';
import { WorkerModule } from './worker.module.js';

export async function createWorkerApp(options: AppConfigOptions): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(options), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  return app;
}
