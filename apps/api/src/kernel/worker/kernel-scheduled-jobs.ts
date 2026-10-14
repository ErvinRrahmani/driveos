import { Injectable, type OnModuleInit } from '@nestjs/common';
import { purgeIdempotencyKeys } from '../idempotency/purge.js';
import { ScheduledJobs } from '../jobs/scheduled-jobs.js';
import { DeliveryReconciler } from '../outbox/reconciler.js';
import { OutboxRelay } from '../outbox/relay.js';
import { TenantContext } from '../tenant/tenant-context.js';

export const RELAY_TICK_MS = 60_000;

@Injectable()
export class KernelScheduledJobs implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledJobs,
    private readonly relay: OutboxRelay,
    private readonly reconciler: DeliveryReconciler,
    private readonly tenant: TenantContext,
  ) {}

  onModuleInit(): void {
    this.scheduled.register({
      name: 'kernel.outbox-relay-tick',
      every: RELAY_TICK_MS,
      handler: () => this.relay.relayUntilEmpty(),
    });
    this.scheduled.register({
      name: 'kernel.delivery-reconcile',
      pattern: '0 * * * *',
      handler: () => this.reconciler.reconcileOnce(),
    });
    this.scheduled.register({
      name: 'kernel.idempotency-purge',
      pattern: '30 * * * *',
      handler: () => purgeIdempotencyKeys(this.tenant),
    });
  }
}
