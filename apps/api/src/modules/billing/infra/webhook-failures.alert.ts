import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertProbes } from '../../../kernel/alerts/index.js';
import type { Env } from '../../../kernel/config/env.js';
import { PaymentWebhookFailures } from './payment-webhook-failures.js';

@Injectable()
export class WebhookFailuresAlert implements OnModuleInit {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly probes: AlertProbes,
    private readonly failures: PaymentWebhookFailures,
  ) {}

  onModuleInit(): void {
    const windowMs =
      this.config.get('ALERT_WEBHOOK_FAILURES_WINDOW_SECONDS', { infer: true }) * 1000;
    this.probes.register({
      name: 'webhook_failures',
      threshold: this.config.get('ALERT_WEBHOOK_FAILURES_THRESHOLD', { infer: true }),
      measure: async (now) => ({
        value: await this.failures.countSince(new Date(now.getTime() - windowMs)),
        schoolId: null,
      }),
    });
  }
}
