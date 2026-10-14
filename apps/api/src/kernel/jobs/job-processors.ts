import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Job, Worker } from 'bullmq';
import { JobQueues, type QueueName } from './queues.js';

export interface JobProcessorDefinition {
  queue: QueueName;
  concurrency?: number;
  process: (job: Job) => Promise<unknown>;
}

@Injectable()
export class JobProcessors implements OnModuleDestroy {
  private readonly definitions = new Map<QueueName, JobProcessorDefinition>();
  private workers: Worker[] | undefined;

  constructor(private readonly queues: JobQueues) {}

  get running(): boolean {
    return this.workers !== undefined;
  }

  register(definition: JobProcessorDefinition): void {
    if (this.definitions.has(definition.queue)) {
      throw new Error(`Queue "${definition.queue}" already has a processor`);
    }
    this.definitions.set(definition.queue, definition);
  }

  list(): QueueName[] {
    return [...this.definitions.keys()].sort();
  }

  start(): void {
    if (this.workers) throw new Error('Job processors are already running');
    this.workers = [...this.definitions.values()].map(({ queue, concurrency, process }) =>
      this.queues.worker(queue, process, { concurrency: concurrency ?? 1 }),
    );
  }

  async stop(): Promise<void> {
    const workers = this.workers ?? [];
    this.workers = undefined;
    await Promise.all(workers.map((worker) => worker.close()));
  }

  onModuleDestroy(): Promise<void> {
    return this.stop();
  }
}
