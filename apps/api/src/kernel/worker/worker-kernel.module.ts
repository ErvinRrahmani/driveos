import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { JobsModule } from '../jobs/jobs.module.js';
import { DeliveryReconciler } from '../outbox/reconciler.js';
import { OutboxRelayLoop } from '../outbox/relay-loop.js';
import { OutboxRelay } from '../outbox/relay.js';
import { EventDelivery } from '../subscribers/event-delivery.js';
import { EventsWorker } from '../subscribers/events-worker.js';
import { SubscriberRegistry } from '../subscribers/subscriber-registry.js';
import { KernelScheduledJobs } from './kernel-scheduled-jobs.js';

const providers = [
  SubscriberRegistry,
  OutboxRelay,
  OutboxRelayLoop,
  DeliveryReconciler,
  EventDelivery,
  EventsWorker,
  KernelScheduledJobs,
];

@Module({
  imports: [DiscoveryModule, JobsModule],
  providers,
  exports: providers,
})
export class WorkerKernelModule {}
