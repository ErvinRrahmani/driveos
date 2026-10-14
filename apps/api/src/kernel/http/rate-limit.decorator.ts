import type { Env } from '../config/env.js';

export const RATE_LIMIT_POLICIES = {
  auth: { limit: 'RATE_LIMIT_AUTH_LIMIT', window: 'RATE_LIMIT_AUTH_WINDOW_SECONDS' },
  'auth-contact': {
    limit: 'RATE_LIMIT_AUTH_CONTACT_LIMIT',
    window: 'RATE_LIMIT_AUTH_CONTACT_WINDOW_SECONDS',
  },
  invitations: {
    limit: 'RATE_LIMIT_INVITATIONS_LIMIT',
    window: 'RATE_LIMIT_INVITATIONS_WINDOW_SECONDS',
  },
  webhooks: { limit: 'RATE_LIMIT_WEBHOOKS_LIMIT', window: 'RATE_LIMIT_WEBHOOKS_WINDOW_SECONDS' },
  'fake-pay': { limit: 'RATE_LIMIT_FAKE_PAY_LIMIT', window: 'RATE_LIMIT_FAKE_PAY_WINDOW_SECONDS' },
  health: { limit: 'RATE_LIMIT_HEALTH_LIMIT', window: 'RATE_LIMIT_HEALTH_WINDOW_SECONDS' },
  'public-page': {
    limit: 'RATE_LIMIT_PUBLIC_PAGE_LIMIT',
    window: 'RATE_LIMIT_PUBLIC_PAGE_WINDOW_SECONDS',
  },
  leads: { limit: 'RATE_LIMIT_LEADS_LIMIT', window: 'RATE_LIMIT_LEADS_WINDOW_SECONDS' },
} as const satisfies Record<string, { limit: keyof Env; window: keyof Env }>;

export type RateLimitName = keyof typeof RATE_LIMIT_POLICIES;

export type RateLimitKey = 'ip' | 'contact' | 'ip+route';

export interface RateLimitRule {
  name: RateLimitName;
  keyBy: RateLimitKey;
  limit?: number;
  windowSeconds?: number;
}

export const RATE_LIMITS = Symbol('rate-limits');

export function RateLimit(rule: RateLimitRule): MethodDecorator & ClassDecorator {
  return (target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const holder: object = descriptor ? (descriptor.value as object) : target;
    const rules: RateLimitRule[] = Reflect.getOwnMetadata(RATE_LIMITS, holder) ?? [];
    Reflect.defineMetadata(RATE_LIMITS, [...rules, rule], holder);
  };
}

export function rateLimitRules(handler: object, controller: object): RateLimitRule[] {
  return [
    ...((Reflect.getOwnMetadata(RATE_LIMITS, controller) as RateLimitRule[] | undefined) ?? []),
    ...((Reflect.getOwnMetadata(RATE_LIMITS, handler) as RateLimitRule[] | undefined) ?? []),
  ];
}
