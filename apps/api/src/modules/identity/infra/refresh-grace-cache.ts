import { Injectable } from '@nestjs/common';
import { RedisConnection } from '../../../kernel/redis/redis-connection.js';

@Injectable()
export class RefreshGraceCache {
  constructor(private readonly redis: RedisConnection) {}

  async put(rotatedTokenHash: string, successorToken: string, ttlMs: number): Promise<void> {
    await this.redis.client.set(this.key(rotatedTokenHash), successorToken, 'PX', ttlMs);
  }

  get(rotatedTokenHash: string): Promise<string | null> {
    return this.redis.client.get(this.key(rotatedTokenHash));
  }

  private key(tokenHash: string): string {
    return `${this.redis.prefix}:auth:refresh-grace:${tokenHash}`;
  }
}
