import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';

export const FAIL_FAST_COMMAND_TIMEOUT_MS = 250;

@Injectable()
export class RedisConnection implements OnApplicationShutdown {
  private readonly logger = new Logger('Redis');
  private connection: Redis | undefined;
  private failFastConnection: Redis | undefined;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get client(): Redis {
    if (!this.connection) {
      this.connection = new Redis(this.config.get('REDIS_URL', { infer: true }), {
        maxRetriesPerRequest: null,
      });
      this.connection.on('error', (error: Error) =>
        this.logger.warn({ msg: 'redis connection error', error: error.message }),
      );
    }
    return this.connection;
  }

  /**
   * For callers that must not wait on Redis (rate limits): commands time out instead of queueing
   * while Redis is unreachable. BullMQ needs the patient `client` above.
   */
  get failFastClient(): Redis {
    if (!this.failFastConnection) {
      this.failFastConnection = new Redis(this.config.get('REDIS_URL', { infer: true }), {
        maxRetriesPerRequest: 1,
        commandTimeout: FAIL_FAST_COMMAND_TIMEOUT_MS,
        connectTimeout: 1_000,
      });
      this.failFastConnection.on('error', () => undefined);
    }
    return this.failFastConnection;
  }

  get prefix(): string {
    return this.config.get('JOBS_PREFIX', { infer: true });
  }

  get opened(): boolean {
    return this.connection !== undefined;
  }

  async close(): Promise<void> {
    const connections = [this.connection, this.failFastConnection];
    this.connection = undefined;
    this.failFastConnection = undefined;
    await Promise.all(
      connections.map((connection) => connection?.quit().catch(() => connection.disconnect())),
    );
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
