import { describe, expect, it } from 'vitest';
import { t } from '../src/kernel/i18n/i18n.js';

describe('api i18n', () => {
  it('translates the not-found error into English', () => {
    expect(t('errors.not_found')).toBe('The requested resource was not found.');
  });

  it('has the invitation templates messaging (4f) sends', () => {
    const values = { schoolName: 'Fahrschule Spree', url: 'https://x/accept', expiresOn: '15 Oct' };
    expect(t('notifications.invitation.sms', values)).toBe(
      'Fahrschule Spree invited you to DriveOS. Accept here: https://x/accept',
    );
    expect(t('notifications.invitation.email_subject', values)).toBe(
      'Fahrschule Spree invited you to DriveOS',
    );
    expect(t('notifications.invitation.email_text', values)).toContain('15 Oct');
  });
});
