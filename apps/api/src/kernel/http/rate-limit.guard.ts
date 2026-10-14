import { createHmac } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import type { Env } from '../config/env.js';
import { t } from '../i18n/i18n.js';
import { RedisConnection } from '../redis/redis-connection.js';
import { ApiError } from './api-error.js';
import { RATE_LIMIT_POLICIES, type RateLimitRule, rateLimitRules } from './rate-limit.decorator.js';

export const RETRY_AFTER_HEADER = 'Retry-After';

interface Counted {
  count: number;
  ttlMs: number;
}

export class RateLimitedError extends ApiError {
  constructor(readonly retryAfterSeconds: number) {
    super(StatusCodes.TOO_MANY_REQUESTS, 'rate_limited', t('errors.rate_limited'), {
      retryAfterSeconds,
    });
    this.name = 'RateLimitedError';
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger('RateLimit');
  private redisDown = false;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly redis: RedisConnection,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const rules = rateLimitRules(context.getHandler(), context.getClass());
    if (rules.length === 0 || !this.config.get('RATE_LIMIT_ENABLED', { infer: true })) return true;
    const request = context.switchToHttp().getRequest<Request>();
    let retryAfterSeconds = 0;
    for (const rule of rules) {
      const key = this.keyFor(rule, request);
      if (!key) continue;
      const { limit, windowSeconds } = this.policy(rule);
      const counted = await this.count(key, windowSeconds);
      if (counted && counted.count > limit) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          Math.max(1, Math.ceil(counted.ttlMs / 1000)),
        );
      }
    }
    if (retryAfterSeconds === 0) return true;
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader(RETRY_AFTER_HEADER, String(retryAfterSeconds));
    throw new RateLimitedError(retryAfterSeconds);
  }

  private policy(rule: RateLimitRule): { limit: number; windowSeconds: number } {
    const names = RATE_LIMIT_POLICIES[rule.name];
    return {
      limit: rule.limit ?? this.config.get(names.limit, { infer: true }),
      windowSeconds: rule.windowSeconds ?? this.config.get(names.window, { infer: true }),
    };
  }

  private keyFor(rule: RateLimitRule, request: Request): string | null {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const base = `${this.redis.prefix}:ratelimit:${rule.name}`;
    switch (rule.keyBy) {
      case 'ip':
        return `${base}:ip:${ip}`;
      case 'ip+route': {
        const route = (request.route as { path?: unknown } | undefined)?.path;
        return `${base}:route:${request.method} ${String(route ?? request.path)}:${ip}`;
      }
      case 'contact': {
        const contact = (request.body as { contact?: unknown } | undefined)?.contact;
        if (typeof contact !== 'string' || contact.trim() === '') return null;
        const digest = createHmac('sha256', this.config.get('AUTH_CODE_PEPPER', { infer: true }))
          .update(contact.trim().toLowerCase())
          .digest('hex');
        return `${base}:contact:${digest}`;
      }
    }
  }

  private async count(key: string, windowSeconds: number): Promise<Counted | null> {
    try {
      const results = await this.redis.failFastClient
        .multi()
        .incr(key)
        .expire(key, windowSeconds, 'NX')
        .pttl(key)
        .exec();
      for (const [error] of results ?? []) if (error) throw error;
      this.redisDown = false;
      return { count: Number(results?.[0]?.[1] ?? 0), ttlMs: Number(results?.[2]?.[1] ?? 0) };
    } catch (error) {
      if (!this.redisDown) {
        this.redisDown = true;
        this.logger.warn({
          msg: 'rate limit check skipped: redis unavailable',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    }
  }
}
