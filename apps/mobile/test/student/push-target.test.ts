import { describe, expect, it } from 'vitest';
import { studentPushTarget } from '../../src/lib/push-target';

const STUDENT = '0192f000-0007-7000-8000-000000000001';
const NOTIFICATION = '0192f000-0130-7000-8000-000000000001';
const LESSON = '0192f000-0101-7000-8000-000000000001';

describe('studentPushTarget', () => {
  it('opens the review screen from a review request', () => {
    expect(
      studentPushTarget({
        template: 'review_request',
        notificationId: NOTIFICATION,
        studentId: STUDENT,
      }),
    ).toBe('/student/review');
  });

  it('passes an https external review link on to the screen', () => {
    const externalReviewUrl = 'https://g.page/r/fahrschule-spree/review?hl=en';
    expect(
      studentPushTarget({
        template: 'review_request',
        studentId: STUDENT,
        url: 'driveos://student/review',
        externalReviewUrl,
      }),
    ).toBe(`/student/review?externalReviewUrl=${encodeURIComponent(externalReviewUrl)}`);
  });

  it('drops an external review link that is missing or not https', () => {
    for (const externalReviewUrl of [null, '', 'http://example.com/review', 'javascript:x']) {
      expect(
        studentPushTarget({ template: 'review_request', studentId: STUDENT, externalReviewUrl }),
      ).toBe('/student/review');
    }
  });

  it('ignores every other notification', () => {
    expect(studentPushTarget({ template: 'lesson_reminder', lessonId: LESSON })).toBeNull();
    expect(studentPushTarget({ template: 'invoice_issued', invoiceId: LESSON })).toBeNull();
    expect(studentPushTarget({ studentId: STUDENT })).toBeNull();
    expect(studentPushTarget(null)).toBeNull();
    expect(studentPushTarget('review_request')).toBeNull();
  });
});
