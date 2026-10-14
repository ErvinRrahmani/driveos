import { describe, expect, it } from 'vitest';
import {
  type ChatViewer,
  chatAccess,
  type ConversationFacts,
  laterPointer,
  messagePreview,
  otherParticipants,
  retentionCutoff,
  schoolCanRead,
} from '../../../src/modules/messaging/domain/chat.js';

const STUDENT = 'student-1';
const OTHER_STUDENT = 'student-2';
const INSTRUCTOR = 'membership-instructor';

const nobody: ChatViewer = {
  readAll: false,
  membershipId: 'membership-x',
  instructor: false,
  ownStudentId: null,
};

const office: ChatViewer = { ...nobody, readAll: true };
const instructor: ChatViewer = { ...nobody, membershipId: INSTRUCTOR, instructor: true };
const student: ChatViewer = { ...nobody, ownStudentId: STUDENT };

const schoolChat: ConversationFacts = {
  kind: 'student_school',
  studentId: STUDENT,
  instructorMembershipId: null,
  studentActive: true,
  instructorAssigned: false,
};

const instructorChat: ConversationFacts = {
  kind: 'student_instructor',
  studentId: STUDENT,
  instructorMembershipId: INSTRUCTOR,
  studentActive: true,
  instructorAssigned: true,
};

const canPost = { canRead: true, canPost: true, readOnly: false };
const readOnly = { canRead: true, canPost: false, readOnly: true };
const hidden = { canRead: false, canPost: false, readOnly: false };

describe('chatAccess', () => {
  it('lets the student and owner/office post in the school chat', () => {
    expect(chatAccess(student, schoolChat)).toEqual(canPost);
    expect(chatAccess(office, schoolChat)).toEqual(canPost);
  });

  it('hides the school chat from instructors and other students', () => {
    expect(chatAccess(instructor, schoolChat)).toEqual(hidden);
    expect(chatAccess({ ...nobody, ownStudentId: OTHER_STUDENT }, schoolChat)).toEqual(hidden);
    expect(chatAccess(nobody, schoolChat)).toEqual(hidden);
  });

  it('lets owner/office read but not post in an instructor chat', () => {
    expect(chatAccess(office, instructorChat)).toEqual(readOnly);
  });

  it('lets the assigned instructor and the student post in the instructor chat', () => {
    expect(chatAccess(instructor, instructorChat)).toEqual(canPost);
    expect(chatAccess(student, instructorChat)).toEqual(canPost);
  });

  it("hides another instructor's chat", () => {
    expect(chatAccess({ ...instructor, membershipId: 'membership-other' }, instructorChat)).toEqual(
      hidden,
    );
  });

  it('lets an owner who is also the instructor post in their own instructor chat', () => {
    expect(chatAccess({ ...instructor, readAll: true }, instructorChat)).toEqual(canPost);
  });

  it('keeps an unassigned instructor able to read but not post', () => {
    const unassigned = { ...instructorChat, instructorAssigned: false };
    expect(chatAccess(instructor, unassigned)).toEqual(readOnly);
    expect(chatAccess(student, unassigned)).toEqual(canPost);
  });

  it('makes the chats of an archived or anonymized student read-only for everyone', () => {
    const archived = { ...schoolChat, studentActive: false };
    expect(chatAccess(student, archived)).toEqual(readOnly);
    expect(chatAccess(office, archived)).toEqual(readOnly);
    expect(chatAccess(instructor, { ...instructorChat, studentActive: false })).toEqual(readOnly);
  });
});

describe('schoolCanRead', () => {
  it('tells participants of instructor chats that the school can read them', () => {
    expect(schoolCanRead('student_instructor')).toBe(true);
    expect(schoolCanRead('student_school')).toBe(false);
  });
});

describe('laterPointer', () => {
  const early = {
    id: '0192f000-0000-7000-8000-000000000001',
    sentAt: new Date('2026-10-01T10:00Z'),
  };
  const late = {
    id: '0192f000-0000-7000-8000-000000000002',
    sentAt: new Date('2026-10-02T10:00Z'),
  };
  const sameTimeHigherId = { id: '0192f000-0000-7000-8000-000000000003', sentAt: late.sentAt };

  it('moves forward but never backwards', () => {
    expect(laterPointer(null, early)).toBe(early);
    expect(laterPointer(early, late)).toBe(late);
    expect(laterPointer(late, early)).toBe(late);
  });

  it('breaks ties on the message id', () => {
    expect(laterPointer(late, sameTimeHigherId)).toBe(sameTimeHigherId);
    expect(laterPointer(sameTimeHigherId, late)).toBe(sameTimeHigherId);
  });
});

describe('messagePreview', () => {
  it('collapses whitespace and cuts long bodies to 140 characters', () => {
    expect(messagePreview('  Hello\n\n there  ')).toBe('Hello there');
    const preview = messagePreview('x'.repeat(500));
    expect(preview).toHaveLength(140);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('otherParticipants', () => {
  it('drops the sender, empty entries and duplicates', () => {
    expect(otherParticipants(['a', null, 'b', 'a', 'sender'], 'sender')).toEqual(['a', 'b']);
  });
});

describe('retentionCutoff', () => {
  it('goes back whole calendar months in UTC', () => {
    expect(retentionCutoff(new Date('2026-10-10T03:30:00Z'), 24).toISOString()).toBe(
      '2024-10-10T03:30:00.000Z',
    );
  });

  it('clamps to the last day of a shorter month', () => {
    expect(retentionCutoff(new Date('2026-03-31T03:30:00Z'), 1).toISOString()).toBe(
      '2026-02-28T03:30:00.000Z',
    );
  });
});
