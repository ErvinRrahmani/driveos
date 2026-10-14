import { type INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { AppConfigOptions } from './kernel/config/config.module.js';
import { type Env, openApiUiEnabled } from './kernel/config/env.js';
import { ApiExceptionFilter } from './kernel/http/api-exception.filter.js';
import { buildOpenApiDocument } from './kernel/openapi/document.js';

export const API_PREFIX = 'v1';
export const UNPREFIXED_CONTROLLERS: readonly string[] = ['fake-pay'];

function trustProxy(value: string): boolean | number | string {
  if (value === 'true' || value === 'false') return value === 'true';
  return /^\d+$/.test(value) ? Number(value) : value;
}

export function configureHttpApp<T extends INestApplication>(app: T): T {
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', trustProxy(config.get('HTTP_TRUST_PROXY', { infer: true })));
  app.enableCors({ origin: config.get('ADMIN_ORIGIN', { infer: true }) });
  app.setGlobalPrefix(API_PREFIX, {
    exclude: UNPREFIXED_CONTROLLERS.map((path) => ({
      path: `${path}/{*rest}`,
      method: RequestMethod.ALL,
    })),
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  const docs = openApiUiEnabled({
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    OPENAPI_UI_ENABLED: config.get('OPENAPI_UI_ENABLED', { infer: true }),
  });
  if (docs) {
    SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app), {
      jsonDocumentUrl: 'docs-json',
    });
  }
  return app;
}

export async function createHttpApp(options: AppConfigOptions): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(options), {
    bufferLogs: true,
    rawBody: true,
  });
  return configureHttpApp(app);
}
