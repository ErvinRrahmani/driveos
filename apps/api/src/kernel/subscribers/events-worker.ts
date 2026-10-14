import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Worker } from 'bullmq';
import type { Env } from '../config/env.js';
import { boundedExponentialDelay } from '../jobs/backoff.js';
import { JobQueues, QUEUES } from '../jobs/queues.js';
import { EVENT_MAX_ATTEMPTS, type EventJobData } from '../outbox/event-job.js';
import { EventDelivery, type DeliveryOutcome } from './event-delivery.js';

export const EVENTS_CONCURRENCY = 4;

@Injectable()
export class EventsWorker implements OnModuleDestroy {
  private worker: Worker<EventJobData> | undefined;

  constructor(
    private readonly queues: JobQueues,
    private readonly delivery: EventDelivery,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get running(): boolean {
    return this.worker !== undefined;
  }

  start(options: { concurrency?: number } = {}): Worker<EventJobData> {
    if (this.worker) throw new Error('The events worker is already running');
    const bounds = {
      delayMs: this.config.get('EVENT_BACKOFF_DELAY_MS', { infer: true }),
      maxMs: this.config.get('EVENT_BACKOFF_MAX_MS', { infer: true }),
    };
    this.worker = this.queues.worker<EventJobData>(QUEUES.events, (job) => this.process(job), {
      concurrency: options.concurrency ?? EVENTS_CONCURRENCY,
      settings: {
        backoffStrategy: (attemptsMade) => boundedExponentialDelay(attemptsMade, bounds),
      },
    });
    return this.worker;
  }

  async stop(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    await worker?.close();
  }

  onModuleDestroy(): Promise<void> {
    return this.stop();
  }

  private process(job: Job<EventJobData>): Promise<DeliveryOutcome> {
    return this.delivery.deliver(job.data, {
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? EVENT_MAX_ATTEMPTS,
    });
  }
}
