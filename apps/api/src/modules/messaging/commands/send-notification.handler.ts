import type { NotificationChannel } from '@driveos/shared';
import { CommandHandler, type ICommandHandler, QueryBus } from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { ListDevicesForUsersQuery, MembershipDirectory } from '../../identity/index.js';
import { planChannels } from '../domain/quiet-hours.js';
import { parseTemplatePayload, TEMPLATE_POLICIES } from '../domain/templates.js';
import { NotificationClock } from '../infra/notification-clock.js';
import { notifications } from '../infra/schema.js';
import { SchoolTimingReader } from '../infra/school-timing.js';
import {
  type NotificationRecipients,
  type NotificationRequest,
  SendNotificationCommand,
  type SentNotifications,
} from './send-notification.command.js';

interface Target {
  userId: string | null;
  locale: string | null;
  channels: { channel: NotificationChannel; address: string | null }[];
}

type NewNotification = typeof notifications.$inferInsert;

@CommandHandler(SendNotificationCommand)
export class SendNotificationHandler implements ICommandHandler<
  SendNotificationCommand,
  SentNotifications
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    private readonly directory: MembershipDirectory,
    private readonly clock: NotificationClock,
    private readonly timing: SchoolTimingReader,
  ) {}

  async execute({ input }: SendNotificationCommand): Promise<SentNotifications> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Sending a notification needs a school scope');
    const payload = parseTemplatePayload(input.template, input.payload);
    const targets = await this.targets(input);
    if (targets.length === 0) return { notificationIds: [] };
    const now = this.clock.now();
    const { quiet, timeZone } = await this.timing.read();
    const rows: NewNotification[] = [];
    for (const target of targets) {
      const plan = planChannels({
        timing: input.timing,
        channels: target.channels.map((c) => c.channel),
        sendAt: input.sendAt ?? now,
        now,
        skipAfter: input.skipAfter,
        quiet,
        timeZone,
      });
      for (const planned of plan) {
        rows.push({
          id: newId(),
          schoolId,
          userId: target.userId,
          address: target.channels.find((c) => c.channel === planned.channel)?.address ?? null,
          locale: target.locale,
          channel: planned.channel,
          template: input.template,
          payload,
          status: planned.skipped ? 'skipped' : 'scheduled',
          scheduledFor: planned.scheduledFor,
          skipAfter: input.skipAfter ?? null,
          dedupeKey: input.dedupeKey ?? null,
          lastError: planned.skipped ? 'expired' : null,
        });
      }
    }
    if (rows.length === 0) return { notificationIds: [] };
    const inserted = await this.tenant.tx
      .insert(notifications)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    return { notificationIds: inserted.map((row) => row.id) };
  }

  private async targets(input: NotificationRequest): Promise<Target[]> {
    const channels = [...new Set(input.channels ?? TEMPLATE_POLICIES[input.template].channels)];
    if ('contacts' in input.recipients) {
      return input.recipients.contacts
        .map((contact) => ({
          userId: null,
          locale: contact.locale ?? null,
          channels: channels.flatMap((channel) => {
            const address =
              channel === 'sms' ? contact.phone : channel === 'email' ? contact.email : null;
            return address ? [{ channel, address }] : [];
          }),
        }))
        .filter((target) => target.channels.length > 0);
    }
    const userIds = await this.members(input.recipients);
    const withoutDevice = await this.usersWithoutDevice(input, channels, userIds);
    return userIds.map((userId) => ({
      userId,
      locale: null,
      channels: [
        ...new Set(
          channels.map((channel) =>
            channel === 'push' && withoutDevice.has(userId) ? 'email' : channel,
          ),
        ),
      ].map((channel) => ({ channel, address: null })),
    }));
  }

  private async members(
    recipients: Exclude<NotificationRecipients, { contacts: unknown }>,
  ): Promise<string[]> {
    const candidates: (string | null)[] = [];
    if ('userIds' in recipients) candidates.push(...recipients.userIds);
    else {
      for (const id of recipients.membershipIds) candidates.push(await this.directory.userIdOf(id));
    }
    const unique = [...new Set(candidates.filter((id): id is string => id !== null))];
    const contacts = await this.directory.contactsOf(unique);
    return contacts.map((contact) => contact.userId);
  }

  private async usersWithoutDevice(
    input: NotificationRequest,
    channels: readonly NotificationChannel[],
    userIds: readonly string[],
  ): Promise<Set<string>> {
    if (!TEMPLATE_POLICIES[input.template].emailWhenNoDevice || !channels.includes('push')) {
      return new Set();
    }
    const devices = await this.queryBus.execute(new ListDevicesForUsersQuery(userIds));
    const withDevice = new Set(devices.map((device) => device.userId));
    return new Set(userIds.filter((userId) => !withDevice.has(userId)));
  }
}
