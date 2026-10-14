import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_POLICIES,
  templateVars,
} from '../../../src/modules/messaging/domain/templates.js';
import { renderNotification } from '../../../src/modules/messaging/infra/notification-renderer.js';

const context = { locale: 'en', timeZone: 'Europe/London', schoolName: 'Drive Right' };
const studentId = '019a0000-0000-7000-8000-000000000001';
const leadId = '019a0000-0000-7000-8000-000000000002';
const url = 'driveos://student/review';
const external = 'https://g.page/r/drive-right/review';

describe('lead_captured template', () => {
  it('pushes, or emails a user without a device', () => {
    expect(TEMPLATE_POLICIES.lead_captured).toEqual({
      channels: ['push'],
      emailWhenNoDevice: true,
    });
  });

  it('names the lead and the licence class', () => {
    const payload = { leadId, fullName: 'Lena Learner', licenceClass: 'A2' };
    expect(templateVars('lead_captured', payload, context)).toEqual({
      schoolName: 'Drive Right',
      name: 'Lena Learner',
      licenceClass: 'A2',
    });
    expect(renderNotification('lead_captured', 'push', payload, context)).toEqual({
      channel: 'push',
      title: 'New enquiry',
      body: 'Lena Learner asked about a class A2 licence.',
    });
  });

  it('says "enquired again" for a repeat enquiry', () => {
    const payload = { leadId, fullName: 'Lena Learner', licenceClass: 'A2', repeated: true };
    expect(renderNotification('lead_captured', 'push', payload, context)).toEqual({
      channel: 'push',
      title: 'Enquiry again',
      body: 'Lena Learner enquired again about a class A2 licence.',
    });
    expect(renderNotification('lead_captured', 'email', payload, context)).toEqual({
      channel: 'email',
      subject: 'Lena Learner enquired again',
      text: 'Lena Learner enquired again about a class A2 licence through Drive Right. The new message is on the lead in DriveOS Leads.',
    });
  });
});

describe('review_request template', () => {
  it('pushes, or emails a user without a device', () => {
    expect(TEMPLATE_POLICIES.review_request).toEqual({
      channels: ['push'],
      emailWhenNoDevice: true,
    });
  });

  it('rejects a payload without the nullable external link', () => {
    expect(() => templateVars('review_request', { studentId, url }, context)).toThrow();
  });

  it('adds the external review line to the email only when the school has one', () => {
    const plain = renderNotification(
      'review_request',
      'email',
      { studentId, url, externalReviewUrl: null },
      context,
    );
    const withExternal = renderNotification(
      'review_request',
      'email',
      { studentId, url, externalReviewUrl: external },
      context,
    );
    expect(plain).toMatchObject({ subject: 'Congratulations on passing! How did Drive Right do?' });
    if (plain.channel !== 'email' || withExternal.channel !== 'email') throw new Error('not email');
    expect(plain.text).toContain(url);
    expect(plain.text).not.toContain('You can also review');
    expect(withExternal.text).toBe(
      `${plain.text}\n\nYou can also review Drive Right here: ${external}`,
    );
  });

  it('keeps the push short, with or without the external link', () => {
    const push = (externalReviewUrl: string | null) =>
      renderNotification('review_request', 'push', { studentId, url, externalReviewUrl }, context);
    expect(push(external)).toEqual({
      channel: 'push',
      title: 'Congratulations!',
      body: 'You passed your driving test. Tell others how Drive Right did.',
    });
    expect(push(null)).toEqual(push(external));
  });
});
