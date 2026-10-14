import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { OutboxRelay } from './relay.js';

@Injectable()
export class OutboxRelayLoop implements OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private loop: Promise<void> | undefined;
  private stopping = false;
  private wake: (() => void) | undefined;

  constructor(
    private readonly relay: OutboxRelay,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get running(): boolean {
    return this.loop !== undefined;
  }

  start(): void {
    if (this.loop) throw new Error('The outbox relay loop is already running');
    this.stopping = false;
    this.loop = this.run(this.config.get('OUTBOX_POLL_MS', { infer: true }));
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.wake?.();
    await this.loop;
    this.loop = undefined;
  }

  onModuleDestroy(): Promise<void> {
    return this.stop();
  }

  private async run(pollMs: number): Promise<void> {
    while (!this.stopping) {
      try {
        const relayed = await this.relay.relayUntilEmpty();
        if (relayed.events > 0) this.logger.debug({ msg: 'relayed events', ...relayed });
      } catch (error) {
        this.logger.error({
          msg: 'outbox relay failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!this.stopping) await this.sleep(pollMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wake = done;
    });
  }
}
