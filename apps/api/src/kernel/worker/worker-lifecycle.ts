import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { JobProcessors } from '../jobs/job-processors.js';
import { JobQueues } from '../jobs/queues.js';
import { ScheduledJobs } from '../jobs/scheduled-jobs.js';
import { OutboxRelayLoop } from '../outbox/relay-loop.js';
import { EventsWorker } from '../subscribers/events-worker.js';
import { SubscriberRegistry } from '../subscribers/subscriber-registry.js';

@Injectable()
export class WorkerLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Worker');
  private started = false;

  constructor(
    private readonly relayLoop: OutboxRelayLoop,
    private readonly events: EventsWorker,
    private readonly scheduled: ScheduledJobs,
    private readonly subscribers: SubscriberRegistry,
    private readonly queues: JobQueues,
    private readonly processors: JobProcessors,
  ) {}

  get running(): boolean {
    return this.started;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.scheduled.start();
    this.events.start();
    this.processors.start();
    this.relayLoop.start();
    this.started = true;
    this.logger.log({
      msg: 'worker started',
      prefix: this.queues.prefix,
      subscribers: this.subscribers.names(),
      scheduledJobs: this.scheduled.list().map((job) => job.name),
      queues: this.processors.list(),
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await this.relayLoop.stop();
    await Promise.all([this.events.stop(), this.scheduled.stop(), this.processors.stop()]);
    this.logger.log({ msg: 'worker stopped' });
  }
}
