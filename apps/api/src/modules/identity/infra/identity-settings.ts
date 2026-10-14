import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../kernel/config/env.js';
import type { LoginCodeLimits } from '../domain/login-code.js';
import type { RefreshTtl } from '../domain/refresh-token.js';

@Injectable()
export class IdentitySettings {
  readonly pepper: string;
  readonly refreshTtl: RefreshTtl;
  readonly limits: LoginCodeLimits;
  readonly contactWindowSeconds: number;
  readonly ipWindowSeconds: number;

  constructor(config: ConfigService<Env, true>) {
    this.pepper = config.get('AUTH_CODE_PEPPER', { infer: true });
    this.refreshTtl = {
      webDays: config.get('AUTH_REFRESH_TTL_WEB_DAYS', { infer: true }),
      mobileDays: config.get('AUTH_REFRESH_TTL_MOBILE_DAYS', { infer: true }),
    };
    this.limits = {
      perContact: config.get('AUTH_CODES_PER_CONTACT', { infer: true }),
      perIp: config.get('AUTH_CODES_PER_IP', { infer: true }),
      perPrefixPerDay: config.get('AUTH_CODES_PER_PREFIX_PER_DAY', { infer: true }),
    };
    this.contactWindowSeconds = config.get('AUTH_CODES_CONTACT_WINDOW_SECONDS', { infer: true });
    this.ipWindowSeconds = config.get('AUTH_CODES_IP_WINDOW_SECONDS', { infer: true });
  }
}
