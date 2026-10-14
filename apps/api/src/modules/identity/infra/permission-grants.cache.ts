import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { RedisConnection } from '../../../kernel/redis/redis-connection.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { permissionGrants } from './schema.js';

export const PERMISSION_CACHE_TTL_SECONDS = 300;

@Injectable()
export class PermissionGrantsCache {
  constructor(
    private readonly redis: RedisConnection,
    private readonly tenant: TenantContext,
  ) {}

  async grants(schoolId: string, userId: string, membershipId: string): Promise<string[]> {
    const key = this.key(schoolId, membershipId);
    const cached = await this.redis.client.get(key);
    if (cached !== null) return JSON.parse(cached) as string[];
    const grants = await this.tenant.runInTenant({ schoolId, userId }, async () => {
      const rows = await this.tenant.tx
        .select({ permission: permissionGrants.permission })
        .from(permissionGrants)
        .where(eq(permissionGrants.membershipId, membershipId))
        .orderBy(asc(permissionGrants.permission));
      return rows.map((row) => row.permission);
    });
    await this.redis.client.set(key, JSON.stringify(grants), 'EX', PERMISSION_CACHE_TTL_SECONDS);
    return grants;
  }

  async invalidate(schoolId: string, membershipId: string): Promise<void> {
    await this.redis.client.del(this.key(schoolId, membershipId));
  }

  private key(schoolId: string, membershipId: string): string {
    return `${this.redis.prefix}:perm:${schoolId}:${membershipId}`;
  }
}
