import { describe, expect, it } from 'vitest';
import type { LeadEnquiry } from '@driveos/shared';
import {
  appendEnquiry,
  findDuplicate,
  type LeadMatch,
  leadConsentIssues,
  leadPurgeCutoffs,
  normalizeLeadName,
} from '../../../src/modules/training/domain/leads.js';

const NOW = new Date('2026-10-14T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function match(overrides: Partial<LeadMatch> = {}): LeadMatch {
  return {
    id: '0192f000-0121-7000-8000-000000000001',
    phone: '+4915550000020',
    email: 'lena.lead@example.com',
    fullName: 'Lena Lead',
    status: 'new',
    createdAt: daysAgo(3),
    ...overrides,
  };
}

const LENA = 'Lena Lead';

describe('findDuplicate', () => {
  it('matches the same phone within 30 days', () => {
    const existing = match({ email: null });
    expect(
      findDuplicate([existing], { phone: '+4915550000020', email: null, fullName: LENA }, NOW),
    ).toBe(existing);
  });

  it('matches the email case-insensitively', () => {
    const existing = match({ phone: null });
    expect(
      findDuplicate(
        [existing],
        { phone: null, email: 'Lena.Lead@Example.COM', fullName: LENA },
        NOW,
      ),
    ).toBe(existing);
  });

  it('matches contacted leads but never converted or lost ones', () => {
    const candidate = { phone: '+4915550000020', email: null, fullName: LENA };
    const contacted = match({ status: 'contacted' });
    expect(findDuplicate([contacted], candidate, NOW)).toBe(contacted);
    expect(findDuplicate([match({ status: 'converted' })], candidate, NOW)).toBeNull();
    expect(findDuplicate([match({ status: 'lost' })], candidate, NOW)).toBeNull();
  });

  it('needs the same name, ignoring case and extra spaces', () => {
    const existing = match();
    expect(
      findDuplicate(
        [existing],
        { phone: '+4915550000020', email: null, fullName: '  lena   LEAD ' },
        NOW,
      ),
    ).toBe(existing);
    // A sibling enquiring with the parent's phone becomes their own lead.
    expect(
      findDuplicate(
        [existing],
        { phone: '+4915550000020', email: null, fullName: 'Max Lead' },
        NOW,
      ),
    ).toBeNull();
  });

  it('ignores lost leads', () => {
    expect(
      findDuplicate(
        [match({ status: 'lost' })],
        { phone: '+4915550000020', email: null, fullName: LENA },
        NOW,
      ),
    ).toBeNull();
  });

  it('ignores leads older than the window', () => {
    const old = match({ createdAt: daysAgo(31) });
    expect(
      findDuplicate([old], { phone: '+4915550000020', email: null, fullName: LENA }, NOW),
    ).toBeNull();
    expect(
      findDuplicate([old], { phone: '+4915550000020', email: null, fullName: LENA }, NOW, 40),
    ).toBe(old);
  });

  it('ignores leads with a different contact', () => {
    expect(
      findDuplicate(
        [match()],
        { phone: '+4915550000099', email: 'other@example.com', fullName: LENA },
        NOW,
      ),
    ).toBeNull();
  });

  it('never matches on a missing contact', () => {
    const existing = match({ phone: null, email: null });
    expect(findDuplicate([existing], { phone: null, email: null, fullName: LENA }, NOW)).toBeNull();
  });

  it('picks the newest matching lead', () => {
    const older = match({ id: 'older', createdAt: daysAgo(10) });
    const newer = match({ id: 'newer', createdAt: daysAgo(1) });
    expect(
      findDuplicate([older, newer], { phone: '+4915550000020', email: null, fullName: LENA }, NOW),
    ).toBe(newer);
  });
});

describe('leadConsentIssues', () => {
  it('accepts an adult with a phone', () => {
    expect(leadConsentIssues({ phone: '+4915550000020', isMinor: false })).toEqual([]);
  });

  it('needs a phone or an email', () => {
    expect(leadConsentIssues({ isMinor: false })).toEqual([
      { path: ['phone'], message: 'Give a phone or an email' },
    ]);
  });

  it('needs the guardian name and contact for a minor', () => {
    expect(leadConsentIssues({ email: 'mila@example.com', isMinor: true })).toEqual([
      { path: ['guardianName'], message: 'Required for a minor' },
      { path: ['guardianContact'], message: 'Required for a minor' },
    ]);
    expect(
      leadConsentIssues({
        email: 'mila@example.com',
        isMinor: true,
        guardianName: 'Markus Minor',
        guardianContact: '+4915550000021',
      }),
    ).toEqual([]);
  });
});

describe('normalizeLeadName', () => {
  it('trims, collapses whitespace and lower-cases', () => {
    expect(normalizeLeadName('  Lena \t  LEAD\n')).toBe('lena lead');
  });
});

describe('appendEnquiry', () => {
  const enquiry = (n: number): LeadEnquiry => ({
    message: `Message ${n}`,
    receivedAt: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(),
    source: 'page',
  });

  it('adds the enquiry at the end', () => {
    expect(appendEnquiry([enquiry(1)], enquiry(2))).toEqual([enquiry(1), enquiry(2)]);
  });

  it('keeps the first enquiry and the newest ones up to the cap', () => {
    const many = Array.from({ length: 5 }, (_, n) => enquiry(n));
    expect(appendEnquiry(many, enquiry(5), 4)).toEqual([
      enquiry(0),
      enquiry(3),
      enquiry(4),
      enquiry(5),
    ]);
  });
});

describe('leadPurgeCutoffs', () => {
  it('deletes closed leads after 12 months and drops the IP hash after 30 days', () => {
    expect(leadPurgeCutoffs(NOW)).toEqual({
      deleteClosedBefore: new Date('2025-10-14T12:00:00Z'),
      dropIpHashBefore: new Date('2026-09-14T12:00:00Z'),
    });
  });
});
