import type { Lead, LeadStatus } from '@driveos/shared';

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'converted',
  'lost',
] as const satisfies readonly LeadStatus[];

/** The tabs above the inbox: every status plus "all". */
export const LEAD_TABS = ['all', ...LEAD_STATUSES] as const;
export type LeadTab = (typeof LEAD_TABS)[number];

export function leadContact(lead: Pick<Lead, 'phone' | 'email'>): string | null {
  return lead.phone ?? lead.email;
}

/** When the lead last enquired: the newest enquiry (a repeat resurfaces the lead), else creation. */
export function lastEnquiryAt(lead: Pick<Lead, 'createdAt' | 'enquiries'>): string {
  return lead.enquiries.at(-1)?.receivedAt ?? lead.createdAt;
}
