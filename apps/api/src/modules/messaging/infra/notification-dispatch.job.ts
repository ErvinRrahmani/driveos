import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PerSchoolJobs, type PerSchoolSummary, ScheduledJobs } from '../../../kernel/jobs/index.js';
import { NotificationDispatcher } from './notification-dispatcher.js';

export const NOTIFICATION_DISPATCH_JOB = 'messaging.notification-dispatch';
export const NOTIFICATION_DISPATCH_EVERY_MS = 30_000;

@Injectable()
export class NotificationDispatchJob implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledJobs,
    private readonly perSchool: PerSchoolJobs,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  onModuleInit(): void {
    this.scheduled.register({
      name: NOTIFICATION_DISPATCH_JOB,
      every: NOTIFICATION_DISPATCH_EVERY_MS,
      handler: () => this.dispatch(),
    });
  }

  dispatch(now?: Date): Promise<PerSchoolSummary> {
    return this.perSchool.runForEachSchool(NOTIFICATION_DISPATCH_JOB, async () => {
      await this.dispatcher.dispatchDue(now);
    });
  }
}
