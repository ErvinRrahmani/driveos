import type { Conversation } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import { canPost, mergeMessagePages } from '../../src/lib/inbox';

const conversation = (patch: Partial<Conversation>): Conversation => ({
  id: 'c1',
  kind: 'student_school',
  studentId: 's1',
  studentName: 'Stella Student',
  instructorMembershipId: null,
  instructorName: null,
  readOnly: false,
  schoolCanRead: false,
  unreadCount: 0,
  lastReadMessageId: null,
  lastMessage: null,
  ...patch,
});

describe('canPost', () => {
  it('lets staff post in school chats unless the server says read-only', () => {
    expect(canPost(conversation({}), 'office')).toBe(true);
    expect(canPost(conversation({ readOnly: true }), 'office')).toBe(false);
  });

  it('keeps instructor chats read-only for staff who are not the instructor', () => {
    const chat = conversation({ kind: 'student_instructor', instructorMembershipId: 'ingo' });
    expect(canPost(chat, 'otto')).toBe(false);
    expect(canPost(chat, 'ingo')).toBe(true);
    expect(canPost({ ...chat, readOnly: true }, 'ingo')).toBe(false);
  });
});

describe('mergeMessagePages', () => {
  it('returns messages oldest first without duplicates', () => {
    const message = (id: string, sentAt: string) => ({
      id,
      conversationId: 'c1',
      senderUserId: 'u1',
      senderName: 'Ingo',
      body: id,
      sentAt,
    });
    const pages = [
      { items: [message('m3', '2026-10-03T10:00:00Z'), message('m2', '2026-10-02T10:00:00Z')] },
      { items: [message('m2', '2026-10-02T10:00:00Z'), message('m1', '2026-10-01T10:00:00Z')] },
    ];
    expect(mergeMessagePages(pages).map((item) => item.id)).toEqual(['m1', 'm2', 'm3']);
  });
});
