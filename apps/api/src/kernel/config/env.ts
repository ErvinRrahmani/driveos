import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const millis = z.coerce.number().int().positive();
const count = z.coerce.number().int().positive();
const secret = z.string().min(32);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: port,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  ADMIN_ORIGIN: z.url(),
  APP_PUBLIC_URL: z.url().default('http://localhost:15173'),
  API_PUBLIC_URL: z.url().optional(),
  OPENAPI_UI_ENABLED: z.stringbool().optional(),
  DATABASE_URL: postgresUrl,
  DATABASE_SYSTEM_URL: postgresUrl,
  DATABASE_OWNER_URL: postgresUrl.optional(),
  DATABASE_ADMIN_URL: postgresUrl.optional(),
  REDIS_URL: z.url(),
  JOBS_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default('driveos'),
  OUTBOX_POLL_MS: millis.default(500),
  EVENT_BACKOFF_DELAY_MS: millis.default(1000),
  EVENT_BACKOFF_MAX_MS: millis.default(300_000),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: port,
  MAIL_FROM: z.email(),
  MAILPIT_API_URL: z.url().default('http://localhost:18025'),
  AUTH_JWT_SECRET: secret,
  AUTH_CODE_PEPPER: secret,
  AUTH_ACCESS_TTL_SECONDS: count.default(900),
  AUTH_REFRESH_TTL_WEB_DAYS: count.default(30),
  AUTH_REFRESH_TTL_MOBILE_DAYS: count.default(90),
  AUTH_CODES_PER_CONTACT: count.default(3),
  AUTH_CODES_CONTACT_WINDOW_SECONDS: count.default(900),
  AUTH_CODES_PER_IP: count.default(20),
  AUTH_CODES_IP_WINDOW_SECONDS: count.default(3600),
  AUTH_CODES_PER_PREFIX_PER_DAY: count.default(500),
  FAKE_PAYMENT_SECRET: secret.default('dev-only-fake-payment-secret-change-me-0000'),
  HTTP_TRUST_PROXY: z.string().min(1).default('loopback'),
  RATE_LIMIT_ENABLED: z.stringbool().default(true),
  RATE_LIMIT_AUTH_LIMIT: count.default(30),
  RATE_LIMIT_AUTH_WINDOW_SECONDS: count.default(300),
  RATE_LIMIT_AUTH_CONTACT_LIMIT: count.default(10),
  RATE_LIMIT_AUTH_CONTACT_WINDOW_SECONDS: count.default(900),
  RATE_LIMIT_INVITATIONS_LIMIT: count.default(20),
  RATE_LIMIT_INVITATIONS_WINDOW_SECONDS: count.default(900),
  RATE_LIMIT_WEBHOOKS_LIMIT: count.default(600),
  RATE_LIMIT_WEBHOOKS_WINDOW_SECONDS: count.default(60),
  RATE_LIMIT_FAKE_PAY_LIMIT: count.default(60),
  RATE_LIMIT_FAKE_PAY_WINDOW_SECONDS: count.default(60),
  RATE_LIMIT_HEALTH_LIMIT: count.default(600),
  RATE_LIMIT_HEALTH_WINDOW_SECONDS: count.default(60),
  RATE_LIMIT_PUBLIC_PAGE_LIMIT: count.default(120),
  RATE_LIMIT_PUBLIC_PAGE_WINDOW_SECONDS: count.default(3600),
  ALERTS_INTERVAL_MS: millis.default(60_000),
  ALERT_DEAD_LETTERS_THRESHOLD: z.coerce.number().int().min(0).default(0),
  ALERT_OUTBOX_LAG_SECONDS: count.default(60),
  ALERT_WEBHOOK_FAILURES_THRESHOLD: z.coerce.number().int().min(0).default(0),
  ALERT_WEBHOOK_FAILURES_WINDOW_SECONDS: count.default(900),
  ALERT_SYNC_BACKLOG_SECONDS: count.default(60),
});

export type Env = z.infer<typeof envSchema>;

export function apiPublicUrl(env: Pick<Env, 'API_PORT' | 'API_PUBLIC_URL'>): string {
  return (env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}`).replace(/\/+$/, '');
}

export function openApiUiEnabled(env: Pick<Env, 'NODE_ENV' | 'OPENAPI_UI_ENABLED'>): boolean {
  return env.OPENAPI_UI_ENABLED ?? env.NODE_ENV !== 'production';
}

export const dbToolEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  DATABASE_SYSTEM_URL: postgresUrl,
  DATABASE_OWNER_URL: postgresUrl,
  DATABASE_ADMIN_URL: postgresUrl,
});

export type DbToolEnv = z.infer<typeof dbToolEnvSchema>;

function parseWith<T extends z.ZodType>(schema: T, raw: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}

export function parseEnv(raw: Record<string, unknown>): Env {
  return parseWith(envSchema, raw);
}

export function parseDbToolEnv(raw: Record<string, unknown>): DbToolEnv {
  return parseWith(dbToolEnvSchema, raw);
}
