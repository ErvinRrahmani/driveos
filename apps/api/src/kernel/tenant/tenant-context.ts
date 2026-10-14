import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/clients.js';
import { DatabaseService } from '../db/database.service.js';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface Tenant {
  schoolId: string | null;
  userId: string | null;
}

interface TenantScope extends Tenant {
  tx: Transaction;
}

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantScope>();

  constructor(private readonly database: DatabaseService) {}

  get tx(): Transaction {
    return this.scope().tx;
  }

  get schoolId(): string | null {
    return this.scope().schoolId;
  }

  get userId(): string | null {
    return this.scope().userId;
  }

  get active(): boolean {
    return this.storage.getStore() !== undefined;
  }

  async runInTenant<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> {
    const current = this.storage.getStore();
    if (current) {
      if (current.schoolId !== tenant.schoolId || current.userId !== tenant.userId) {
        throw new Error('Cannot open a scope for a different tenant inside a tenant scope');
      }
      return fn();
    }
    return this.database.app.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.school_id', ${tenant.schoolId ?? ''}, true),
          set_config('app.user_id', ${tenant.userId ?? ''}, true)`,
      );
      return this.storage.run({ schoolId: tenant.schoolId, userId: tenant.userId, tx }, fn);
    });
  }

  /**
   * Runs `fn` inside a SAVEPOINT of the current tenant transaction; every `tx` read in `fn`
   * is the savepoint, so a failure rolls back only what `fn` wrote.
   */
  async savepoint<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.scope();
    return current.tx.transaction((tx) => this.storage.run({ ...current, tx }, fn));
  }

  /**
   * Bypasses RLS. Only for the outbox relay, cross-school schedulers and platform billing;
   * request handlers and support access must never call it.
   */
  /**
   * Platform onboarding and platform billing act on one school from a request that has no school
   * (a platform admin). This scopes `fn` to that school inside the same transaction, so RLS keeps
   * applying, and restores the school-less setting afterwards.
   */
  async enterSchool<T>(schoolId: string, fn: () => Promise<T>): Promise<T> {
    const current = this.scope();
    if (current.schoolId !== null) {
      throw new Error('enterSchool can only be used from a scope without a school');
    }
    await this.setSchool(current.tx, schoolId);
    let failed = true;
    try {
      const result = await this.storage.run({ ...current, schoolId }, fn);
      failed = false;
      return result;
    } finally {
      await this.setSchool(current.tx, '').catch((error: unknown) => {
        if (!failed) throw error;
      });
    }
  }

  async runAsSystem<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    if (this.active) throw new Error('runAsSystem cannot be called inside a tenant scope');
    return this.database.system.transaction(fn);
  }

  private async setSchool(tx: Transaction, schoolId: string): Promise<void> {
    await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
  }

  private scope(): TenantScope {
    const scope = this.storage.getStore();
    if (!scope) throw new Error('TenantContext used outside a tenant scope');
    return scope;
  }
}
