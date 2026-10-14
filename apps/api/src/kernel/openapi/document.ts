import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { componentSchemas } from './schemas.js';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('DriveOS API')
    .setVersion('1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...componentSchemas() },
  };
  return document;
}
