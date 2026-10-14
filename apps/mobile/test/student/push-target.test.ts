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

  it('never carries an external link into the screen', () => {
    for (const externalReviewUrl of [
      'https://g.page/r/fahrschule-spree/review',
      'http://example.com/review',
      null,
    ]) {
      expect(
        studentPushTarget({
          template: 'review_request',
          studentId: STUDENT,
          url: 'driveos://student/review',
          externalReviewUrl,
        }),
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
