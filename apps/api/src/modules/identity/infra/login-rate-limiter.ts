import { Injectable } from '@nestjs/common';
import { RedisConnection } from '../../../kernel/redis/redis-connection.js';
import { type Contact, countryPrefix } from '../domain/contact.js';
import type { LoginCodeCounts } from '../domain/login-code.js';
import { hashSecret } from '../domain/secrets.js';
import { IdentitySettings } from './identity-settings.js';

const DAY_SECONDS = 86_400;

@Injectable()
export class LoginRateLimiter {
  constructor(
    private readonly redis: RedisConnection,
    private readonly settings: IdentitySettings,
  ) {}

  async count(contact: Contact, ip: string, now: Date): Promise<LoginCodeCounts> {
    const contactKey = this.key('contact', hashSecret(this.settings.pepper, contact.value));
    const ipKey = this.key('ip', ip);
    const prefixKey = contact.kind === 'phone' ? this.prefixKey(contact.value, now) : null;
    const pipeline = this.redis.client
      .multi()
      .incr(contactKey)
      .expire(contactKey, this.settings.contactWindowSeconds, 'NX')
      .incr(ipKey)
      .expire(ipKey, this.settings.ipWindowSeconds, 'NX');
    if (prefixKey) pipeline.get(prefixKey);
    const results = (await pipeline.exec()) ?? [];
    for (const [error] of results) if (error) throw error;
    const value = (index: number) => Number(results[index]?.[1] ?? 0);
    return {
      contact: value(0),
      ip: value(2),
      prefix: prefixKey ? value(4) : null,
    };
  }

  async recordSend(contact: Contact, now: Date): Promise<void> {
    if (contact.kind !== 'phone') return;
    const key = this.prefixKey(contact.value, now);
    await this.redis.client
      .multi()
      .incr(key)
      .expire(key, 2 * DAY_SECONDS, 'NX')
      .exec();
  }

  private prefixKey(phone: string, now: Date): string {
    return this.key('prefix', `${countryPrefix(phone)}:${now.toISOString().slice(0, 10)}`);
  }

  private key(kind: string, id: string): string {
    return `${this.redis.prefix}:auth:codes:${kind}:${id}`;
  }
}
