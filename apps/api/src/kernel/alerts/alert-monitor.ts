import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlatformAlert, PlatformAlertListResponse } from '@driveos/shared';
import { sql } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { ScheduledJobs } from '../jobs/scheduled-jobs.js';
import { TenantContext } from '../tenant/tenant-context.js';
import { type AlertMeasurement, AlertProbes } from './alert-probes.js';
import { AlertStore } from './alert-store.js';
import { secondsBetween } from './subscriber-backlog.js';

export const ALERTS_JOB = 'platform.alerts';

@Injectable()
export class AlertMonitor implements OnModuleInit {
  private readonly logger = new Logger('Alerts');

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly scheduled: ScheduledJobs,
    private readonly tenant: TenantContext,
    private readonly probes: AlertProbes,
    private readonly store: AlertStore,
  ) {}

  onModuleInit(): void {
    this.probes.register({
      name: 'dead_letters',
      threshold: this.config.get('ALERT_DEAD_LETTERS_THRESHOLD', { infer: true }),
      measure: () => this.deadLetters(),
    });
    this.probes.register({
      name: 'outbox_lag',
      threshold: this.config.get('ALERT_OUTBOX_LAG_SECONDS', { infer: true }),
      measure: (now) => this.outboxLag(now),
    });
    this.scheduled.register({
      name: ALERTS_JOB,
      every: this.config.get('ALERTS_INTERVAL_MS', { infer: true }),
      handler: () => this.evaluateOnce(),
    });
  }

  async evaluateOnce(now: Date = new Date()): Promise<PlatformAlertListResponse> {
    const previous = new Map((await this.store.current()).items.map((item) => [item.alert, item]));
    const items: PlatformAlert[] = [];
    for (const probe of this.probes.list()) {
      const before = previous.get(probe.name);
      let measured: AlertMeasurement;
      try {
        measured = await probe.measure(now);
      } catch (error) {
        this.logger.error({
          msg: 'alert probe failed',
          alert: probe.name,
          error: error instanceof Error ? error.message : String(error),
        });
        if (before) items.push(before);
        continue;
      }
      const firing = measured.value > probe.threshold;
      const fields = {
        alert: probe.name,
        value: measured.value,
        threshold: probe.threshold,
        schoolId: measured.schoolId,
      };
      if (firing) {
        items.push({ ...fields, since: before?.since ?? now.toISOString() });
        if (!before) this.logger.warn({ msg: 'alert raised', state: 'raised', ...fields });
      } else if (before) {
        this.logger.warn({ msg: 'alert cleared', state: 'cleared', ...fields });
      }
    }
    const state = { items, evaluatedAt: now.toISOString() };
    await this.store.replace(state);
    return state;
  }

  private async deadLetters(): Promise<AlertMeasurement> {
    const [row] = await this.tenant.runAsSystem(async (tx) => {
      const result = await tx.execute<{ n: number; school_id: string | null }>(sql`
        select (select count(*)::int from dead_letters) as n,
               (select o.school_id from dead_letters d join outbox o on o.id = d.event_id
                 order by d.failed_at desc limit 1) as school_id`);
      return result.rows;
    });
    return { value: Number(row?.n ?? 0), schoolId: row?.school_id ?? null };
  }

  private async outboxLag(now: Date): Promise<AlertMeasurement> {
    const [oldest] = await this.tenant.runAsSystem(async (tx) => {
      const result = await tx.execute<{ school_id: string | null; occurred_at: string }>(sql`
        select school_id, occurred_at from outbox
         where published_at is null order by seq limit 1`);
      return result.rows;
    });
    return {
      value: oldest ? secondsBetween(new Date(oldest.occurred_at), now) : 0,
      schoolId: oldest?.school_id ?? null,
    };
  }
}
