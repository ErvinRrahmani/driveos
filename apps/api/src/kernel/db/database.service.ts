import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { createDatabaseClients, type Database, type DatabaseClients } from './clients.js';

export type DatabaseUrls = Pick<Env, 'DATABASE_URL' | 'DATABASE_SYSTEM_URL'>;

export const DATABASE_URLS = Symbol('DATABASE_URLS');

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger('Database');
  private clients: DatabaseClients | undefined;

  constructor(@Inject(DATABASE_URLS) private readonly urls: DatabaseUrls) {}

  get app(): Database {
    return this.connect().app;
  }

  get system(): Database {
    return this.connect().system;
  }

  get opened(): boolean {
    return this.clients !== undefined;
  }

  async close(): Promise<void> {
    const clients = this.clients;
    this.clients = undefined;
    await clients?.close();
  }

  onApplicationShutdown(): Promise<void> {
    return this.close();
  }

  private connect(): DatabaseClients {
    this.clients ??= createDatabaseClients(this.urls, {
      onPoolError: (role, error) =>
        this.logger.error({ msg: 'database pool error', role, error: error.message }),
    });
    return this.clients;
  }
}
