import { MESSAGE_PREVIEW_MAX, type NotificationChannel } from '@driveos/shared';
import { z } from 'zod';

const instant = z.iso.datetime({ offset: true });
const lesson = z.object({
  lessonId: z.uuid(),
  start: instant,
  instructorName: z.string(),
});
const money = { totalMinor: z.number().int(), currency: z.string().length(3) };

export const TEMPLATE_PAYLOADS = {
  invitation: z.object({ url: z.url(), expiresAt: instant }),
  lesson_booked: lesson,
  lesson_moved: lesson.extend({ previousStart: instant }),
  lesson_cancelled: lesson,
  lesson_reminder: lesson,
  invoice_issued: z.object({ invoiceId: z.uuid(), number: z.string(), ...money }),
  contract_created: z.object({ contractId: z.uuid() }),
  platform_statement_issued: z.object({ statementId: z.uuid(), month: z.string(), ...money }),
  growth_report_generated: z.object({ reportId: z.uuid(), month: z.string() }),
  message_received: z.object({
    conversationId: z.uuid(),
    senderName: z.string(),
    preview: z.string().max(MESSAGE_PREVIEW_MAX),
  }),
  slot_offer_created: z.object({ offerId: z.uuid(), start: instant, expiresAt: instant }),
  guardian_consent_requested: z.object({
    guardianLinkId: z.uuid(),
    studentId: z.uuid(),
    url: z.url(),
  }),
  lead_captured: z.object({
    leadId: z.uuid(),
    fullName: z.string(),
    licenceClass: z.string(),
    /** A repeat enquiry on an open lead ("… enquired again"). */
    repeated: z.boolean().optional(),
  }),
  review_request: z.object({
    studentId: z.uuid(),
    url: z.url(),
    externalReviewUrl: z.url().nullable(),
  }),
} as const;

export type NotificationTemplate = keyof typeof TEMPLATE_PAYLOADS;
export type TemplatePayload<T extends NotificationTemplate> = z.infer<
  (typeof TEMPLATE_PAYLOADS)[T]
>;

export const notificationTemplateSchema = z.enum(
  Object.keys(TEMPLATE_PAYLOADS) as [NotificationTemplate, ...NotificationTemplate[]],
);

export interface TemplatePolicy {
  channels: readonly NotificationChannel[];
  emailWhenNoDevice: boolean;
}

const PUSH_OR_EMAIL: TemplatePolicy = { channels: ['push'], emailWhenNoDevice: true };
const PUSH_AND_EMAIL: TemplatePolicy = { channels: ['push', 'email'], emailWhenNoDevice: false };

export const TEMPLATE_POLICIES: Record<NotificationTemplate, TemplatePolicy> = {
  invitation: { channels: ['sms', 'email'], emailWhenNoDevice: false },
  lesson_booked: PUSH_OR_EMAIL,
  lesson_moved: PUSH_OR_EMAIL,
  lesson_cancelled: PUSH_OR_EMAIL,
  lesson_reminder: PUSH_OR_EMAIL,
  invoice_issued: PUSH_AND_EMAIL,
  contract_created: PUSH_AND_EMAIL,
  platform_statement_issued: PUSH_AND_EMAIL,
  growth_report_generated: PUSH_AND_EMAIL,
  message_received: { channels: ['push'], emailWhenNoDevice: false },
  slot_offer_created: PUSH_AND_EMAIL,
  guardian_consent_requested: PUSH_AND_EMAIL,
  lead_captured: PUSH_OR_EMAIL,
  review_request: PUSH_OR_EMAIL,
};

export function parseTemplatePayload(
  template: NotificationTemplate,
  payload: unknown,
): Record<string, unknown> {
  return TEMPLATE_PAYLOADS[template].parse(payload);
}

export interface RenderContext {
  locale: string;
  timeZone: string;
  schoolName: string;
}

function formatInstant(iso: string, context: RenderContext): string {
  return new Intl.DateTimeFormat(context.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: context.timeZone,
  }).format(new Date(iso));
}

function formatDay(iso: string, context: RenderContext): string {
  return new Intl.DateTimeFormat(context.locale, {
    dateStyle: 'medium',
    timeZone: context.timeZone,
  }).format(new Date(iso));
}

function formatMoney(minor: number, currency: string, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minor / 10 ** digits);
}

export function templateVars(
  template: NotificationTemplate,
  raw: unknown,
  context: RenderContext,
): Record<string, string> {
  const base = { schoolName: context.schoolName };
  const when = (iso: string) => formatInstant(iso, context);
  switch (template) {
    case 'invitation': {
      const p = TEMPLATE_PAYLOADS.invitation.parse(raw);
      return { ...base, url: p.url, expiresOn: formatDay(p.expiresAt, context) };
    }
    case 'lesson_booked':
    case 'lesson_cancelled':
    case 'lesson_reminder': {
      const p = lesson.parse(raw);
      return { ...base, when: when(p.start), instructor: p.instructorName };
    }
    case 'lesson_moved': {
      const p = TEMPLATE_PAYLOADS.lesson_moved.parse(raw);
      return {
        ...base,
        when: when(p.start),
        previousWhen: when(p.previousStart),
        instructor: p.instructorName,
      };
    }
    case 'invoice_issued': {
      const p = TEMPLATE_PAYLOADS.invoice_issued.parse(raw);
      return {
        ...base,
        number: p.number,
        amount: formatMoney(p.totalMinor, p.currency, context.locale),
      };
    }
    case 'contract_created':
      TEMPLATE_PAYLOADS.contract_created.parse(raw);
      return base;
    case 'platform_statement_issued': {
      const p = TEMPLATE_PAYLOADS.platform_statement_issued.parse(raw);
      return {
        ...base,
        month: p.month,
        amount: formatMoney(p.totalMinor, p.currency, context.locale),
      };
    }
    case 'growth_report_generated': {
      const p = TEMPLATE_PAYLOADS.growth_report_generated.parse(raw);
      return { ...base, month: p.month };
    }
    case 'message_received': {
      const p = TEMPLATE_PAYLOADS.message_received.parse(raw);
      return { ...base, sender: p.senderName, preview: p.preview };
    }
    case 'slot_offer_created': {
      const p = TEMPLATE_PAYLOADS.slot_offer_created.parse(raw);
      return { ...base, when: when(p.start), expires: when(p.expiresAt) };
    }
    case 'guardian_consent_requested': {
      const p = TEMPLATE_PAYLOADS.guardian_consent_requested.parse(raw);
      return { ...base, url: p.url };
    }
    case 'lead_captured': {
      const p = TEMPLATE_PAYLOADS.lead_captured.parse(raw);
      const vars = { ...base, name: p.fullName, licenceClass: p.licenceClass };
      // i18next `context`: `<part>_repeated` for a repeat enquiry.
      return p.repeated ? { ...vars, context: 'repeated' } : vars;
    }
    case 'review_request': {
      const p = TEMPLATE_PAYLOADS.review_request.parse(raw);
      if (!p.externalReviewUrl) return { ...base, url: p.url };
      // i18next `context`: picks `<part>_external_review` (the email text with the extra link)
      // and falls back to the plain part for the push, which stays short.
      return {
        ...base,
        url: p.url,
        externalReviewUrl: p.externalReviewUrl,
        context: 'external_review',
      };
    }
  }
}
