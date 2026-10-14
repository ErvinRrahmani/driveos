import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertProbes, SubscriberBacklog } from '../../../kernel/alerts/index.js';
import type { Env } from '../../../kernel/config/env.js';
import { CHANGE_FEED_SUBSCRIBER } from '../projections/change-feed.projection.js';

@Injectable()
export class SyncBacklogAlert implements OnModuleInit {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly probes: AlertProbes,
    private readonly backlog: SubscriberBacklog,
  ) {}

  onModuleInit(): void {
    this.probes.register({
      name: 'sync_backlog',
      threshold: this.config.get('ALERT_SYNC_BACKLOG_SECONDS', { infer: true }),
      measure: (now) => this.backlog.oldestUndeliveredSeconds(CHANGE_FEED_SUBSCRIBER, now),
    });
  }
}
