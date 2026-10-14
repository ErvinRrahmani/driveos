import { describe, expect, it } from 'vitest';
import {
  appendLeadMessage,
  findDuplicate,
  type LeadMatch,
  leadConsentIssues,
  leadPurgeCutoffs,
} from '../../../src/modules/training/domain/leads.js';

const NOW = new Date('2026-10-14T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function match(overrides: Partial<LeadMatch> = {}): LeadMatch {
  return {
    id: '0192f000-0121-7000-8000-000000000001',
    phone: '+4915550000020',
    email: 'lena.lead@example.com',
    status: 'new',
    createdAt: daysAgo(3),
    ...overrides,
  };
}

describe('findDuplicate', () => {
  it('matches the same phone within 30 days', () => {
    const existing = match({ email: null });
    expect(findDuplicate([existing], { phone: '+4915550000020', email: null }, NOW)).toBe(existing);
  });

  it('matches the email case-insensitively', () => {
    const existing = match({ phone: null });
    expect(findDuplicate([existing], { phone: null, email: 'Lena.Lead@Example.COM' }, NOW)).toBe(
      existing,
    );
  });

  it('ignores lost leads', () => {
    expect(
      findDuplicate([match({ status: 'lost' })], { phone: '+4915550000020', email: null }, NOW),
    ).toBeNull();
  });

  it('ignores leads older than the window', () => {
    const old = match({ createdAt: daysAgo(31) });
    expect(findDuplicate([old], { phone: '+4915550000020', email: null }, NOW)).toBeNull();
    expect(findDuplicate([old], { phone: '+4915550000020', email: null }, NOW, 40)).toBe(old);
  });

  it('ignores leads with a different contact', () => {
    expect(
      findDuplicate([match()], { phone: '+4915550000099', email: 'other@example.com' }, NOW),
    ).toBeNull();
  });

  it('never matches on a missing contact', () => {
    const existing = match({ phone: null, email: null });
    expect(findDuplicate([existing], { phone: null, email: null }, NOW)).toBeNull();
  });

  it('picks the newest matching lead', () => {
    const older = match({ id: 'older', createdAt: daysAgo(10) });
    const newer = match({ id: 'newer', createdAt: daysAgo(1) });
    expect(findDuplicate([older, newer], { phone: '+4915550000020', email: null }, NOW)).toBe(
      newer,
    );
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

describe('appendLeadMessage', () => {
  it('appends a new message below a separator', () => {
    expect(appendLeadMessage('First call', 'Second message')).toBe(
      'First call\n---\nSecond message',
    );
  });

  it('starts the note with the message when there is none', () => {
    expect(appendLeadMessage(null, 'Second message')).toBe('Second message');
  });

  it('keeps the note without a message', () => {
    expect(appendLeadMessage('First call', undefined)).toBe('First call');
    expect(appendLeadMessage(null, undefined)).toBeNull();
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
