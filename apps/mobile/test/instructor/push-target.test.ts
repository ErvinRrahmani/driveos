import { describe, expect, it } from 'vitest';
import { instructorPushTarget } from '../../src/lib/push-target';

const LESSON = '0192f000-0101-7000-8000-000000000001';
const CONVERSATION = '0192f000-0201-7000-8000-000000000001';

describe('instructorPushTarget', () => {
  it('opens the lesson of a lesson reminder', () => {
    expect(
      instructorPushTarget({
        template: 'lesson_reminder',
        notificationId: LESSON,
        lessonId: LESSON,
      }),
    ).toBe(`/instructor/lesson/${LESSON}`);
  });

  it('opens the lesson for any notification that carries a lesson id', () => {
    expect(instructorPushTarget({ template: 'lesson_moved', lessonId: LESSON })).toBe(
      `/instructor/lesson/${LESSON}`,
    );
  });

  it('opens the conversation of a chat message', () => {
    expect(
      instructorPushTarget({ template: 'message_received', conversationId: CONVERSATION }),
    ).toBe(`/instructor/chat/${CONVERSATION}`);
  });

  it('ignores payloads without a usable id', () => {
    expect(
      instructorPushTarget({ template: 'lesson_reminder', lessonId: 'not-a-uuid' }),
    ).toBeNull();
    expect(instructorPushTarget({ template: 'invoice_issued', invoiceId: LESSON })).toBeNull();
    expect(instructorPushTarget(null)).toBeNull();
    expect(instructorPushTarget('lesson')).toBeNull();
  });
});
