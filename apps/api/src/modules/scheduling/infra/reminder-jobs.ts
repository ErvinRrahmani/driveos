import { dateTimeSchema } from '@driveos/shared';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { CommandBus, QueryBus } from '../../../kernel/cqrs/index.js';
import { JobProcessors, JobQueues, QUEUES } from '../../../kernel/jobs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { PlanNotificationMomentQuery, SendNotificationCommand } from '../../messaging/index.js';
import { GetStudentRecipientsQuery } from '../../training/index.js';
import { GetLessonQuery } from '../queries/get-lesson.query.js';

const HOUR = 3_600_000;

export const REMINDERS = [
  { kind: '24h', before: 24 * HOUR },
  { kind: '2h', before: 2 * HOUR },
] as const;

export const reminderJobSchema = z.object({
  schoolId: z.uuid(),
  lessonId: z.uuid(),
  kind: z.enum(['24h', '2h']),
  start: dateTimeSchema,
});

export type ReminderJob = z.infer<typeof reminderJobSchema>;
export type ReminderKind = ReminderJob['kind'];

export const REMINDER_CONCURRENCY = 4;

export function reminderJobId(lessonId: string, kind: ReminderKind): string {
  return `${lessonId}/${kind}`;
}

export class ReminderJobBusyError extends Error {
  constructor(readonly jobId: string) {
    super(`Reminder job ${jobId} is running; the reminder is re-scheduled on a later attempt`);
    this.name = 'ReminderJobBusyError';
  }
}

function leadOf(kind: ReminderKind): number {
  return REMINDERS.find((reminder) => reminder.kind === kind)?.before ?? 0;
}

@Injectable()
export class ReminderJobs implements OnModuleInit {
  private readonly logger = new Logger('ReminderJobs');

  constructor(
    private readonly queues: JobQueues,
    private readonly processors: JobProcessors,
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    this.processors.register({
      queue: QUEUES.reminders,
      concurrency: REMINDER_CONCURRENCY,
      process: (job) => this.run(job.data),
    });
  }

  async schedule(schoolId: string, lessonId: string, start: Date): Promise<void> {
    const now = Date.now();
    for (const { kind, before } of REMINDERS) {
      const jobId = reminderJobId(lessonId, kind);
      if (!(await this.remove(jobId))) throw new ReminderJobBusyError(jobId);
      const moment = await this.queryBus.execute(
        new PlanNotificationMomentQuery({
          timing: 'advanced',
          sendAt: new Date(start.getTime() - before),
        }),
      );
      const delay = moment.getTime() - now;
      if (delay <= 0) continue;
      const data: ReminderJob = { schoolId, lessonId, kind, start: start.toISOString() };
      await this.queue().add(kind, data, {
        jobId,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      });
    }
  }

  async clear(lessonId: string): Promise<void> {
    for (const { kind } of REMINDERS) await this.remove(reminderJobId(lessonId, kind));
  }

  async run(raw: unknown): Promise<void> {
    const job = reminderJobSchema.parse(raw);
    await this.tenant.runInTenant({ schoolId: job.schoolId, userId: null }, async () => {
      const lesson = await this.queryBus.execute(new GetLessonQuery(job.lessonId));
      if (!lesson || lesson.status !== 'booked') return;
      const start = new Date(lesson.start);
      if (start.getTime() !== Date.parse(job.start)) return;
      const recipients = await this.queryBus.execute(
        new GetStudentRecipientsQuery(lesson.studentId),
      );
      const userIds = [
        ...new Set(
          [recipients?.studentUserId ?? null, ...(recipients?.guardianUserIds ?? [])].filter(
            (id): id is string => id !== null,
          ),
        ),
      ];
      if (userIds.length === 0) return;
      await this.commandBus.execute(
        new SendNotificationCommand({
          recipients: { userIds },
          template: 'lesson_reminder',
          payload: {
            lessonId: lesson.id,
            start: start.toISOString(),
            instructorName: lesson.instructorName,
          },
          timing: 'advanced',
          sendAt: new Date(start.getTime() - leadOf(job.kind)),
          skipAfter: start,
          dedupeKey: `${reminderJobId(lesson.id, job.kind)}/${start.toISOString()}`,
        }),
      );
    });
  }

  private queue(): Queue {
    return this.queues.queue(QUEUES.reminders);
  }

  private async remove(jobId: string): Promise<boolean> {
    if ((await this.queue().remove(jobId)) === 1) return true;
    if (!(await this.queue().getJob(jobId))) return true;
    this.logger.warn({ msg: 'reminder job is running; retrying later', jobId });
    return false;
  }
}
