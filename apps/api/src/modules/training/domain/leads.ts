const DAY_MS = 24 * 60 * 60 * 1000;

export const LEAD_DEDUPE_WINDOW_DAYS = 30;
export const LEAD_CLOSED_RETENTION_MONTHS = 12;
export const LEAD_IP_HASH_RETENTION_DAYS = 30;
/** `consent_text_version` of a lead typed in by staff without a consent text (phone call, walk-in). */
export const MANUAL_LEAD_CONSENT_VERSION = 'manual';

export interface LeadMatch {
  id: string;
  phone: string | null;
  email: string | null;
  status: 'new' | 'contacted' | 'converted' | 'lost';
  createdAt: Date;
}

export interface LeadCandidate {
  phone: string | null;
  email: string | null;
}

/**
 * The newest open lead created within the window that shares a phone or an email (case-insensitive)
 * with the candidate. A lost lead never absorbs a new enquiry.
 */
export function findDuplicate<T extends LeadMatch>(
  existing: readonly T[],
  candidate: LeadCandidate,
  now: Date,
  windowDays: number = LEAD_DEDUPE_WINDOW_DAYS,
): T | null {
  const since = now.getTime() - windowDays * DAY_MS;
  const email = candidate.email?.toLowerCase() ?? null;
  const matches = existing.filter(
    (lead) =>
      lead.status !== 'lost' &&
      lead.createdAt.getTime() >= since &&
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

/** A repeat enquiry adds its message below the earlier notes. */
export function appendLeadMessage(
  note: string | null,
  message: string | null | undefined,
): string | null {
  if (!message) return note;
  return note ? `${note}\n---\n${message}` : message;
}

export function leadPurgeCutoffs(now: Date): { deleteClosedBefore: Date; dropIpHashBefore: Date } {
  const deleteClosedBefore = new Date(now);
  deleteClosedBefore.setUTCMonth(deleteClosedBefore.getUTCMonth() - LEAD_CLOSED_RETENTION_MONTHS);
  return {
    deleteClosedBefore,
    dropIpHashBefore: new Date(now.getTime() - LEAD_IP_HASH_RETENTION_DAYS * DAY_MS),
  };
}
