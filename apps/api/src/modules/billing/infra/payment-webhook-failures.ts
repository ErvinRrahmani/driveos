import { Injectable, Logger } from '@nestjs/common';
import { count, gt } from 'drizzle-orm';
import { newId } from '../../../kernel/db/columns.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { paymentWebhookFailures } from './schema.js';

export interface WebhookFailure {
  schoolId: string | null;
  provider: string;
  providerRef: string | null;
  error: unknown;
}

@Injectable()
export class PaymentWebhookFailures {
  private readonly logger = new Logger('PaymentWebhookFailures');

  constructor(private readonly tenant: TenantContext) {}

  async record({ schoolId, provider, providerRef, error }: WebhookFailure): Promise<void> {
    const reason = error instanceof ApiError ? error.code : 'internal';
    this.logger.warn({ msg: 'payment webhook failed', provider, reason, schoolId });
    try {
      await this.tenant.runInTenant({ schoolId, userId: null }, () =>
        this.tenant.tx.insert(paymentWebhookFailures).values({
          id: newId(),
          schoolId,
          provider: provider.slice(0, 64),
          providerRef: providerRef?.slice(0, 255) ?? null,
          reason,
          failedAt: new Date(),
        }),
      );
    } catch (recordError) {
      this.logger.error({
        msg: 'could not record a payment webhook failure',
        error: recordError instanceof Error ? recordError.message : String(recordError),
      });
    }
  }

  async countSince(since: Date): Promise<number> {
    const [row] = await this.tenant.runAsSystem((tx) =>
      tx
        .select({ n: count() })
        .from(paymentWebhookFailures)
        .where(gt(paymentWebhookFailures.failedAt, since)),
    );
    return row?.n ?? 0;
  }
}
