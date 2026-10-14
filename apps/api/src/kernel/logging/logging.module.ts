import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from '../config/env.js';
import { pinoHttpOptions } from './pino-options.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: pinoHttpOptions(config.get('LOG_LEVEL', { infer: true })),
      }),
    }),
  ],
})
export class LoggingModule {}
