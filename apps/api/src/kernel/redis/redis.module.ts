import { Global, Module } from '@nestjs/common';
import { RedisConnection } from './redis-connection.js';

@Global()
@Module({ providers: [RedisConnection], exports: [RedisConnection] })
export class RedisModule {}
