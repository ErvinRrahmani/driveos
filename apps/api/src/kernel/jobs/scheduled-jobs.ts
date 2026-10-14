import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Worker } from 'bullmq';
import { JobQueues, QUEUES } from './queues.js';

export interface ScheduledJobDefinition {
  name: string;
  pattern?: string;
  every?: number;
  handler: () => Promise<unknown>;
}

const JOB_NAME = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

@Injectable()
export class ScheduledJobs implements OnModuleDestroy {
  private readonly logger = new Logger('ScheduledJobs');
  private readonly definitions = new Map<string, ScheduledJobDefinition>();
  private worker: Worker | undefined;

  constructor(private readonly queues: JobQueues) {}

  get running(): boolean {
    return this.worker !== undefined;
  }

  register(definition: ScheduledJobDefinition): void {
    const { name, pattern, every } = definition;
    if (!JOB_NAME.test(name)) {
      throw new Error(`Scheduled job name "${name}" must be lowercase words joined by "." or "-"`);
    }
    if (this.definitions.has(name)) throw new Error(`Scheduled job "${name}" is registered twice`);
    if ((pattern === undefined) === (every === undefined)) {
      throw new Error(`Scheduled job "${name}" needs exactly one of pattern or every`);
    }
    this.definitions.set(name, definition);
  }

  list(): ScheduledJobDefinition[] {
    return [...this.definitions.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async run(name: string): Promise<unknown> {
    const definition = this.definitions.get(name);
    if (!definition) throw new Error(`No scheduled job "${name}" is registered`);
    const started = Date.now();
    try {
      const result = await definition.handler();
      this.logger.debug({ msg: 'scheduled job finished', job: name, ms: Date.now() - started });
      return result;
    } catch (error) {
      this.logger.error({
        msg: 'scheduled job failed',
        job: name,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.worker) throw new Error('Scheduled jobs are already running');
    const queue = this.queues.queue(QUEUES.scheduled);
    for (const { name, pattern, every } of this.definitions.values()) {
      await queue.upsertJobScheduler(
        name,
        pattern === undefined ? { every } : { pattern, tz: 'UTC' },
        {
          name,
          opts: { removeOnComplete: true, removeOnFail: 100 },
        },
      );
    }
    for (const scheduler of await queue.getJobSchedulers()) {
      if (!this.definitions.has(scheduler.key)) await queue.removeJobScheduler(scheduler.key);
    }
    this.worker = this.queues.worker(QUEUES.scheduled, (job) => this.run(job.name), {
      concurrency: 1,
    });
  }

  async stop(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    await worker?.close();
  }

  onModuleDestroy(): Promise<void> {
    return this.stop();
  }
}
