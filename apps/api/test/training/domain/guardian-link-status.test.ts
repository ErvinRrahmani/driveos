import { describe, expect, it } from 'vitest';
import { guardianLinkStatus } from '../../../src/modules/training/domain/guardian-link-status.js';

describe('guardianLinkStatus', () => {
  it('is consented once consent is recorded, whatever the age', () => {
    expect(guardianLinkStatus({ consentAt: new Date(), minor: true })).toBe('consented');
    expect(guardianLinkStatus({ consentAt: new Date(), minor: false })).toBe('consented');
  });

  it('waits for consent for a minor and needs none for an adult', () => {
    expect(guardianLinkStatus({ consentAt: null, minor: true })).toBe('pending_consent');
    expect(guardianLinkStatus({ consentAt: null, minor: false })).toBe('not_required');
  });
});
