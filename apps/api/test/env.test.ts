import { describe, expect, it } from 'vitest';
import {
  apiPublicUrl,
  openApiUiEnabled,
  parseDbToolEnv,
  parseEnv,
} from '../src/kernel/config/env.js';

const valid = {
  NODE_ENV: 'test',
  API_PORT: '13000',
  LOG_LEVEL: 'info',
  ADMIN_ORIGIN: 'http://localhost:15173',
  DATABASE_URL: 'postgres://app_rw:app_rw_dev@localhost:15432/driveos',
  DATABASE_SYSTEM_URL: 'postgres://app_system:app_system_dev@localhost:15432/driveos',
  REDIS_URL: 'redis://localhost:16379',
  S3_ENDPOINT: 'http://localhost:19000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'driveos',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'driveos-documents',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '11025',
  MAIL_FROM: 'no-reply@driveos.local',
  AUTH_JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
  AUTH_CODE_PEPPER: 'test-code-pepper-at-least-32-characters',
};

describe('parseEnv', () => {
  it('coerces ports to numbers', () => {
    const env = parseEnv(valid);
    expect(env.API_PORT).toBe(13000);
    expect(env.SMTP_PORT).toBe(11025);
  });

  it('names every missing or invalid variable', () => {
    const { DATABASE_URL: _db, ...rest } = valid;
    expect(() => parseEnv({ ...rest, API_PORT: 'abc' })).toThrow(
      /DATABASE_URL[\s\S]*API_PORT|API_PORT[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects an unknown log level', () => {
    expect(() => parseEnv({ ...valid, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});

describe('database urls', () => {
  it('requires the app_system url', () => {
    const { DATABASE_SYSTEM_URL: _system, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_SYSTEM_URL/);
  });

  it('does not require owner or admin urls in the app process', () => {
    expect(parseEnv(valid).DATABASE_OWNER_URL).toBeUndefined();
  });

  it('db tooling requires the admin and owner urls', () => {
    expect(() => parseDbToolEnv(valid)).toThrow(/DATABASE_ADMIN_URL/);
    expect(() => parseDbToolEnv(valid)).toThrow(/DATABASE_OWNER_URL/);
    const tool = parseDbToolEnv({
      ...valid,
      DATABASE_ADMIN_URL: 'postgres://driveos:driveos@localhost:15432/driveos',
      DATABASE_OWNER_URL: 'postgres://driveos_owner:driveos_owner_dev@localhost:15432/driveos',
    });
    expect(tool.DATABASE_OWNER_URL).toContain('driveos_owner');
  });

  it('db tooling ignores variables unrelated to the database', () => {
    expect(() =>
      parseDbToolEnv({
        DATABASE_URL: valid.DATABASE_URL,
        DATABASE_SYSTEM_URL: valid.DATABASE_SYSTEM_URL,
        DATABASE_ADMIN_URL: 'postgres://driveos:driveos@localhost:15432/driveos',
        DATABASE_OWNER_URL: 'postgres://driveos_owner:driveos_owner_dev@localhost:15432/driveos',
      }),
    ).not.toThrow();
  });
});

describe('worker settings', () => {
  it('defaults the job prefix, relay poll interval and event backoff', () => {
    const env = parseEnv(valid);
    expect(env.JOBS_PREFIX).toBe('driveos');
    expect(env.OUTBOX_POLL_MS).toBe(500);
    expect(env.EVENT_BACKOFF_DELAY_MS).toBe(1000);
    expect(env.EVENT_BACKOFF_MAX_MS).toBe(300_000);
  });

  it('coerces overrides and rejects a prefix BullMQ cannot use', () => {
    const env = parseEnv({
      ...valid,
      JOBS_PREFIX: 'driveos-test-ab12',
      OUTBOX_POLL_MS: '50',
      EVENT_BACKOFF_DELAY_MS: '1',
      EVENT_BACKOFF_MAX_MS: '10',
    });
    expect(env).toMatchObject({
      JOBS_PREFIX: 'driveos-test-ab12',
      OUTBOX_POLL_MS: 50,
      EVENT_BACKOFF_DELAY_MS: 1,
      EVENT_BACKOFF_MAX_MS: 10,
    });
    expect(() => parseEnv({ ...valid, JOBS_PREFIX: 'a:b' })).toThrow(/JOBS_PREFIX/);
    expect(() => parseEnv({ ...valid, OUTBOX_POLL_MS: '0' })).toThrow(/OUTBOX_POLL_MS/);
  });
});

describe('auth settings', () => {
  it('requires the JWT secret and the code pepper, at least 32 characters each', () => {
    const { AUTH_JWT_SECRET: _secret, AUTH_CODE_PEPPER: _pepper, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/AUTH_JWT_SECRET[\s\S]*AUTH_CODE_PEPPER/);
    expect(() => parseEnv({ ...valid, AUTH_JWT_SECRET: 'short' })).toThrow(/AUTH_JWT_SECRET/);
  });

  it('defaults token lifetimes, rate limits and the Mailpit API url', () => {
    expect(parseEnv(valid)).toMatchObject({
      AUTH_ACCESS_TTL_SECONDS: 900,
      AUTH_REFRESH_TTL_WEB_DAYS: 30,
      AUTH_REFRESH_TTL_MOBILE_DAYS: 90,
      AUTH_CODES_PER_CONTACT: 3,
      AUTH_CODES_CONTACT_WINDOW_SECONDS: 900,
      AUTH_CODES_PER_IP: 20,
      AUTH_CODES_IP_WINDOW_SECONDS: 3600,
      AUTH_CODES_PER_PREFIX_PER_DAY: 500,
      MAILPIT_API_URL: 'http://localhost:18025',
      FAKE_PAYMENT_SECRET: 'dev-only-fake-payment-secret-change-me-0000',
    });
  });

  it('coerces overrides', () => {
    expect(
      parseEnv({ ...valid, AUTH_ACCESS_TTL_SECONDS: '60', AUTH_CODES_PER_PREFIX_PER_DAY: '2' }),
    ).toMatchObject({ AUTH_ACCESS_TTL_SECONDS: 60, AUTH_CODES_PER_PREFIX_PER_DAY: 2 });
  });
});

describe('OPENAPI_UI_ENABLED', () => {
  it('serves the OpenAPI UI by default outside production only', () => {
    expect(openApiUiEnabled(parseEnv(valid))).toBe(true);
    expect(openApiUiEnabled(parseEnv({ ...valid, NODE_ENV: 'development' }))).toBe(true);
    expect(openApiUiEnabled(parseEnv({ ...valid, NODE_ENV: 'production' }))).toBe(false);
  });

  it('follows an explicit setting in any environment', () => {
    const prod = { ...valid, NODE_ENV: 'production' };
    expect(openApiUiEnabled(parseEnv({ ...prod, OPENAPI_UI_ENABLED: 'true' }))).toBe(true);
    expect(openApiUiEnabled(parseEnv({ ...valid, OPENAPI_UI_ENABLED: 'false' }))).toBe(false);
    expect(() => parseEnv({ ...valid, OPENAPI_UI_ENABLED: 'maybe' })).toThrow(/OPENAPI_UI_ENABLED/);
  });
});

describe('API_PUBLIC_URL', () => {
  it('defaults to localhost on API_PORT and drops a trailing slash', () => {
    expect(apiPublicUrl(parseEnv(valid))).toBe('http://localhost:13000');
    expect(apiPublicUrl(parseEnv({ ...valid, API_PUBLIC_URL: 'https://api.example.com/' }))).toBe(
      'https://api.example.com',
    );
    expect(() => parseEnv({ ...valid, API_PUBLIC_URL: 'not a url' })).toThrow(/API_PUBLIC_URL/);
  });
});
