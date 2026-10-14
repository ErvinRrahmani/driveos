import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { Queue, Worker, type Processor, type WorkerOptions } from 'bullmq';
import { RedisConnection } from '../redis/redis-connection.js';

export const QUEUES = {
  events: 'events',
  scheduled: 'scheduled',
  reminders: 'reminders',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

@Injectable()
export class JobQueues implements BeforeApplicationShutdown {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisConnection) {}

  get prefix(): string {
    return this.redis.prefix;
  }

  queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.redis.client, prefix: this.prefix });
      this.queues.set(name, queue);
    }
    return queue;
  }

  worker<T>(
    name: QueueName,
    processor: Processor<T>,
    options: Omit<WorkerOptions, 'connection' | 'prefix'> = {},
  ): Worker<T> {
    return new Worker<T>(name, processor, {
      ...options,
      connection: this.redis.client,
      prefix: this.prefix,
    });
  }

  async close(): Promise<void> {
    const queues = [...this.queues.values()];
    this.queues.clear();
    await Promise.all(queues.map((queue) => queue.close()));
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.close();
  }
}
