import type { NotificationChannel } from '@driveos/shared';
import { i18n } from '../../../kernel/i18n/i18n.js';
import {
  type NotificationTemplate,
  type RenderContext,
  templateVars,
} from '../domain/templates.js';

export type RenderedNotification =
  | { channel: 'push'; title: string; body: string }
  | { channel: 'sms'; body: string }
  | { channel: 'email'; subject: string; text: string };

type Part = 'push_title' | 'push_body' | 'sms' | 'email_subject' | 'email_text';

export function renderNotification(
  template: NotificationTemplate,
  channel: NotificationChannel,
  payload: unknown,
  context: RenderContext,
): RenderedNotification {
  const vars = templateVars(template, payload, context);
  const part = (name: Part, fallback?: Part): string => {
    const key = `notifications.${template}.${name}`;
    if (fallback && !i18n.exists(key, { lng: context.locale })) return part(fallback);
    return String(i18n.t(key as never, { ...vars, lng: context.locale } as never));
  };
  switch (channel) {
    case 'push':
      return { channel, title: part('push_title'), body: part('push_body') };
    case 'sms':
      return { channel, body: part('sms', 'push_body') };
    case 'email':
      return { channel, subject: part('email_subject'), text: part('email_text') };
  }
}
