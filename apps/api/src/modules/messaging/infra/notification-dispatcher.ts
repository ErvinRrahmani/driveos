import { DeviceTokenInvalidated } from '@driveos/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, lte } from 'drizzle-orm';
import { EMAIL_SENDER, type EmailSender } from '../../../adapters/email/email-sender.js';
import { PUSH_SENDER, type PushSender } from '../../../adapters/push/push-sender.js';
import { SMS_SENDER, type SmsSender } from '../../../adapters/sms/sms-sender.js';
import { EventPublisher, newEvent, QueryBus } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import {
  ListDevicesForUsersQuery,
  MembershipDirectory,
  type UserContact,
  type UserDevice,
} from '../../identity/index.js';
import { notificationTemplateSchema } from '../domain/templates.js';
import { NotificationClock } from './notification-clock.js';
import { renderNotification } from './notification-renderer.js';
import { notifications } from './schema.js';
import { type SchoolTiming, SchoolTimingReader } from './school-timing.js';

type NotificationRow = typeof notifications.$inferSelect;
type Outcome = { status: 'sent' | 'skipped' | 'failed'; error: string | null };

interface DispatchContext {
  now: Date;
  school: SchoolTiming;
  contacts: Map<string, UserContact>;
  locales: Map<string, string>;
  devices: Map<string, UserDevice[]>;
}

export interface DispatchSummary {
  sent: number;
  skipped: number;
  failed: number;
}

export const DISPATCH_BATCH = 100;

const sent: Outcome = { status: 'sent', error: null };
const skip = (error: string): Outcome => ({ status: 'skipped', error });
const fail = (error: string): Outcome => ({ status: 'failed', error });

@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    private readonly directory: MembershipDirectory,
    private readonly clock: NotificationClock,
    private readonly timing: SchoolTimingReader,
    private readonly events: EventPublisher,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async dispatchDue(now: Date = this.clock.now()): Promise<DispatchSummary> {
    const summary: DispatchSummary = { sent: 0, skipped: 0, failed: 0 };
    const due = await this.tenant.tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.status, 'scheduled'), lte(notifications.scheduledFor, now)))
      .orderBy(asc(notifications.scheduledFor), asc(notifications.id))
      .limit(DISPATCH_BATCH)
      .for('update', { skipLocked: true });
    if (due.length === 0) return summary;
    const context = await this.context(due, now);
    for (const row of due) {
      const outcome = await this.deliver(row, context);
      summary[outcome.status] += 1;
      await this.tenant.tx
        .update(notifications)
        .set({
          status: outcome.status,
          sentAt: outcome.status === 'sent' ? now : null,
          lastError: outcome.error,
        })
        .where(eq(notifications.id, row.id));
    }
    return summary;
  }

  private async context(due: readonly NotificationRow[], now: Date): Promise<DispatchContext> {
    const userIds = [
      ...new Set(due.map((row) => row.userId).filter((id): id is string => id !== null)),
    ];
    const pushUsers = [
      ...new Set(
        due
          .filter((row) => row.channel === 'push' && row.userId !== null)
          .map((row) => row.userId as string),
      ),
    ];
    const school = await this.timing.read();
    const contacts = await this.directory.contactsOf(userIds);
    const locales = await this.directory.localesOf(userIds);
    const devices = new Map<string, UserDevice[]>();
    for (const device of await this.queryBus.execute(new ListDevicesForUsersQuery(pushUsers))) {
      devices.set(device.userId, [...(devices.get(device.userId) ?? []), device]);
    }
    return {
      now,
      school,
      contacts: new Map(contacts.map((contact) => [contact.userId, contact])),
      locales: new Map(locales.map((row) => [row.userId, row.locale])),
      devices,
    };
  }

  private async deliver(row: NotificationRow, context: DispatchContext): Promise<Outcome> {
    if (row.skipAfter && row.skipAfter.getTime() <= context.now.getTime()) return skip('expired');
    const template = notificationTemplateSchema.safeParse(row.template);
    if (!template.success) return fail('unknown_template');
    const contact = row.userId ? context.contacts.get(row.userId) : undefined;
    const locale =
      row.locale ??
      (row.userId ? context.locales.get(row.userId) : undefined) ??
      context.school.locale;
    try {
      const rendered = renderNotification(template.data, row.channel, row.payload, {
        locale,
        timeZone: context.school.timeZone,
        schoolName: context.school.name,
      });
      switch (rendered.channel) {
        case 'push': {
          const devices = row.userId ? (context.devices.get(row.userId) ?? []) : [];
          if (devices.length === 0) return skip('no_device');
          const data = { template: template.data, notificationId: row.id, ...idsOf(row.payload) };
          const results = await Promise.all(
            devices.map((device) =>
              this.push.send({
                token: device.pushToken,
                title: rendered.title,
                body: rendered.body,
                data,
              }),
            ),
          );
          await this.invalidate(
            row.id,
            devices.filter((_, index) => results[index]?.status === 'invalid_token'),
          );
          return results.some((result) => result.status === 'sent') ? sent : fail('invalid_token');
        }
        case 'sms': {
          const to = row.address ?? contact?.phone;
          if (!to) return skip('no_phone');
          await this.sms.send({ to, body: rendered.body });
          return sent;
        }
        case 'email': {
          const to = row.address ?? contact?.email;
          if (!to) return skip('no_email');
          await this.email.send({ to, subject: rendered.subject, text: rendered.text });
          return sent;
        }
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  private async invalidate(notificationId: string, devices: readonly UserDevice[]): Promise<void> {
    await this.events.append(
      devices.map((device) =>
        newEvent(DeviceTokenInvalidated, {
          aggregateType: 'device',
          aggregateId: device.id,
          aggregateVersion: 1,
          payload: { deviceId: device.id, userId: device.userId, notificationId },
        }),
      ),
    );
  }
}

function idsOf(payload: unknown): Record<string, string> {
  if (typeof payload !== 'object' || payload === null) return {};
  return Object.fromEntries(
    Object.entries(payload).filter(
      (entry): entry is [string, string] => entry[0].endsWith('Id') && typeof entry[1] === 'string',
    ),
  );
}
