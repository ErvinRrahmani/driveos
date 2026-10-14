import { type CaptureLeadRequest, captureLeadRequestSchema } from '@driveos/shared';
import en from '@/locales/en.json';

/** The enrolment form's values: text inputs hold strings, empty means "not given". */
export interface EnquiryValues {
  fullName: string;
  phone: string;
  email: string;
  licenceClass: string;
  message: string;
  isMinor: boolean;
  guardianName: string;
  guardianContact: string;
  consent: boolean;
  /** Honeypot: people never see it, so any value means a bot filled the form. */
  website: string;
}

export type EnquiryField = keyof EnquiryValues;

export function emptyEnquiry(licenceClass: string): EnquiryValues {
  return {
    fullName: '',
    phone: '',
    email: '',
    licenceClass,
    message: '',
    isMinor: false,
    guardianName: '',
    guardianContact: '',
    consent: false,
    website: '',
  };
}

const PHONE_FORMATTING = /[\s().-]/g;

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Visitors type "+49 155 5000 0099"; the API wants E.164 without spaces. */
function optionalPhone(value: string): string | undefined {
  return optional(value.replace(PHONE_FORMATTING, ''));
}

function optionalContact(value: string): string | undefined {
  return value.includes('@') ? optional(value) : optionalPhone(value);
}

function present<T extends object>(entries: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** The `POST /v1/public/schools/{slug}/leads` body; guardian fields only for a minor. */
export function enquiryBody(values: EnquiryValues, consentTextVersion: string): CaptureLeadRequest {
  return {
    fullName: values.fullName.trim(),
    licenceClass: values.licenceClass,
    isMinor: values.isMinor,
    consentTextVersion,
    ...present({
      phone: optionalPhone(values.phone),
      email: optional(values.email),
      message: optional(values.message),
      website: optional(values.website),
    }),
    ...(values.isMinor &&
      present({
        guardianName: optional(values.guardianName),
        guardianContact: optionalContact(values.guardianContact),
      })),
  };
}

function isField(values: EnquiryValues, name: unknown): name is EnquiryField {
  return typeof name === 'string' && name in values;
}

function issueMessage(field: EnquiryField, code: string): string {
  if (code === 'too_big') return 'validation.max';
  if (code === 'custom') return field === 'phone' ? 'validation.contact' : 'validation.required';
  if (field === 'email') return 'validation.email';
  if (field === 'phone') return 'validation.phone';
  if (field === 'guardianContact') return 'validation.contact';
  return 'validation.required';
}

/**
 * Field errors (i18n keys) from the same `captureLeadRequestSchema` the API validates with, plus
 * the consent checkbox, which the API sees only as `consentTextVersion`.
 */
export function enquiryErrors(
  values: EnquiryValues,
  consentTextVersion: string,
): Partial<Record<EnquiryField, string>> | undefined {
  const errors: Partial<Record<EnquiryField, string>> = {};
  const parsed = captureLeadRequestSchema.safeParse(enquiryBody(values, consentTextVersion));
  for (const issue of parsed.error?.issues ?? []) {
    const field = issue.path[0];
    if (isField(values, field)) errors[field] ??= issueMessage(field, issue.code);
  }
  if (!values.consent) errors.consent = 'publicPage.site.form.consentRequired';
  return Object.keys(errors).length > 0 ? errors : undefined;
}

type ConsentVersion = keyof typeof en.publicPage.consent;
export type ConsentTextKey = `publicPage.consent.${ConsentVersion}`;

const CONSENT_VERSION = /^lead-consent\.(v\d+)$/;

/** The i18n key of the consent text the API names (`lead-consent.v1` → `publicPage.consent.v1`). */
export function consentTextKey(consentTextVersion: string): ConsentTextKey | null {
  const version = CONSENT_VERSION.exec(consentTextVersion)?.[1];
  if (!version || !(version in en.publicPage.consent)) return null;
  return `publicPage.consent.${version as ConsentVersion}`;
}
