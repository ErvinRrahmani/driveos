import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { DATABASE_URLS, DatabaseService, type DatabaseUrls } from './database.service.js';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_URLS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): DatabaseUrls => ({
        DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
        DATABASE_SYSTEM_URL: config.get('DATABASE_SYSTEM_URL', { infer: true }),
      }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
