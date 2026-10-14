import type { NotificationChannel, NotificationTiming } from '@driveos/shared';
import { Command } from '../../../kernel/cqrs/index.js';
import type { NotificationTemplate } from '../domain/templates.js';

export interface NotificationContact {
  phone?: string | null;
  email?: string | null;
  locale?: string | null;
}

export type NotificationRecipients =
  | { userIds: readonly string[] }
  | { membershipIds: readonly string[] }
  | { contacts: readonly NotificationContact[] };

export interface NotificationRequest {
  recipients: NotificationRecipients;
  template: NotificationTemplate;
  payload: Readonly<Record<string, unknown>>;
  timing: NotificationTiming;
  sendAt?: Date;
  skipAfter?: Date;
  channels?: readonly NotificationChannel[];
  dedupeKey?: string;
}

export interface SentNotifications {
  notificationIds: string[];
}

export class SendNotificationCommand extends Command<SentNotifications> {
  constructor(readonly input: NotificationRequest) {
    super();
  }
}
