import { LEAD_ENQUIRY_MAX, type LeadEnquiry } from '@driveos/shared';

export { MANUAL_LEAD_CONSENT_VERSION } from '@driveos/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

export const LEAD_DEDUPE_WINDOW_DAYS = 30;
export const LEAD_CLOSED_RETENTION_MONTHS = 12;
export const LEAD_IP_HASH_RETENTION_DAYS = 30;

export interface LeadMatch {
  id: string;
  phone: string | null;
  email: string | null;
  fullName: string;
  status: 'new' | 'contacted' | 'converted' | 'lost';
  createdAt: Date;
}

export interface LeadCandidate {
  phone: string | null;
  email: string | null;
  fullName: string;
}

/** Statuses whose lead absorbs a repeat enquiry; a converted or lost lead never does. */
const OPEN_STATUSES: ReadonlySet<LeadMatch['status']> = new Set(['new', 'contacted']);

/** Trimmed, inner whitespace collapsed, lower-cased: how two enquiries' names are compared. */
export function normalizeLeadName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The newest open (`new` or `contacted`) lead created within the window that shares a phone or an
 * email (case-insensitive) with the candidate and has the same normalized name. A sibling enquiring
 * with a parent's phone therefore becomes a lead of their own.
 */
export function findDuplicate<T extends LeadMatch>(
  existing: readonly T[],
  candidate: LeadCandidate,
  now: Date,
  windowDays: number = LEAD_DEDUPE_WINDOW_DAYS,
): T | null {
  const since = now.getTime() - windowDays * DAY_MS;
  const email = candidate.email?.toLowerCase() ?? null;
  const name = normalizeLeadName(candidate.fullName);
  const matches = existing.filter(
    (lead) =>
      OPEN_STATUSES.has(lead.status) &&
      lead.createdAt.getTime() >= since &&
      normalizeLeadName(lead.fullName) === name &&
      ((candidate.phone !== null && lead.phone === candidate.phone) ||
        (email !== null && lead.email?.toLowerCase() === email)),
  );
  return matches.reduce<T | null>(
    (newest, lead) => (newest === null || lead.createdAt > newest.createdAt ? lead : newest),
    null,
  );
}

export interface LeadConsentInput {
  phone?: string | null | undefined;
  email?: string | null | undefined;
  isMinor: boolean;
  guardianName?: string | null | undefined;
  guardianContact?: string | null | undefined;
}

export interface LeadIssue {
  path: string[];
  message: string;
}

/** A lead needs a phone or an email; a minor's lead needs the guardian's name and contact. */
export function leadConsentIssues(input: LeadConsentInput): LeadIssue[] {
  const issues: LeadIssue[] = [];
  if (!input.phone && !input.email) {
    issues.push({ path: ['phone'], message: 'Give a phone or an email' });
  }
  if (input.isMinor && !input.guardianName) {
    issues.push({ path: ['guardianName'], message: 'Required for a minor' });
  }
  if (input.isMinor && !input.guardianContact) {
    issues.push({ path: ['guardianContact'], message: 'Required for a minor' });
  }
  return issues;
}

/**
 * Adds an enquiry at the end. A lead keeps its first enquiry and the newest ones up to `max`, so a
 * flood of repeats cannot grow the row without bound.
 */
export function appendEnquiry(
  enquiries: readonly LeadEnquiry[],
  enquiry: LeadEnquiry,
  max: number = LEAD_ENQUIRY_MAX,
): LeadEnquiry[] {
  const all = [...enquiries, enquiry];
  if (all.length <= max) return all;
  const [first, ...rest] = all;
  return first ? [first, ...rest.slice(rest.length - (max - 1))] : rest.slice(-max);
}

export function leadPurgeCutoffs(now: Date): { deleteClosedBefore: Date; dropIpHashBefore: Date } {
  const deleteClosedBefore = new Date(now);
  deleteClosedBefore.setUTCMonth(deleteClosedBefore.getUTCMonth() - LEAD_CLOSED_RETENTION_MONTHS);
  return {
    deleteClosedBefore,
    dropIpHashBefore: new Date(now.getTime() - LEAD_IP_HASH_RETENTION_DAYS * DAY_MS),
  };
}
