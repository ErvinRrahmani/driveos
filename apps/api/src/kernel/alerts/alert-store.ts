import { Injectable } from '@nestjs/common';
import { type PlatformAlertListResponse, platformAlertListResponseSchema } from '@driveos/shared';
import { RedisConnection } from '../redis/redis-connection.js';

const EMPTY: PlatformAlertListResponse = { items: [], evaluatedAt: null };

@Injectable()
export class AlertStore {
  constructor(private readonly redis: RedisConnection) {}

  get key(): string {
    return `${this.redis.prefix}:alerts:current`;
  }

  async current(): Promise<PlatformAlertListResponse> {
    const raw = await this.redis.client.get(this.key);
    if (!raw) return EMPTY;
    const parsed = platformAlertListResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY;
  }

  async replace(state: PlatformAlertListResponse): Promise<void> {
    await this.redis.client.set(this.key, JSON.stringify(state));
  }
}
