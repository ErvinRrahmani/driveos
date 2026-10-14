import type { Lead } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import { lastEnquiryAt } from '../../src/lib/leads';

type Dated = Pick<Lead, 'createdAt' | 'enquiries'>;

describe('lastEnquiryAt', () => {
  it('is the newest enquiry, so a repeat at the top of the inbox shows its own date', () => {
    const lead: Dated = {
      createdAt: '2026-10-06T09:00:00.000Z',
      enquiries: [
        { message: 'First', receivedAt: '2026-10-06T09:00:00.000Z', source: 'page' },
        { message: null, receivedAt: '2026-10-08T18:30:00.000Z', source: 'page' },
      ],
    };
    expect(lastEnquiryAt(lead)).toBe('2026-10-08T18:30:00.000Z');
  });

  it('falls back to the creation time without enquiries', () => {
    expect(lastEnquiryAt({ createdAt: '2026-10-06T09:00:00.000Z', enquiries: [] })).toBe(
      '2026-10-06T09:00:00.000Z',
    );
  });
});
