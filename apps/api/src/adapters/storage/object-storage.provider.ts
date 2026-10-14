import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../kernel/config/env.js';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

export const objectStorageProvider: FactoryProvider<ObjectStorage> = {
  provide: OBJECT_STORAGE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) =>
    new S3ObjectStorage({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
      secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      bucket: config.get('S3_BUCKET', { infer: true }),
    }),
};
