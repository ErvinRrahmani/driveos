import type { ConversationKind } from '@driveos/shared';
import { MESSAGE_PREVIEW_MAX } from '@driveos/shared';

export interface ChatViewer {
  readAll: boolean;
  membershipId: string | null;
  instructor: boolean;
  ownStudentId: string | null;
}

export interface ConversationFacts {
  kind: ConversationKind;
  studentId: string;
  instructorMembershipId: string | null;
  studentActive: boolean;
  instructorAssigned: boolean;
}

export interface ChatAccess {
  canRead: boolean;
  canPost: boolean;
  readOnly: boolean;
}

export interface MessagePosition {
  id: string;
  sentAt: Date;
}

const ELLIPSIS = '…';

function access(canRead: boolean, canPost: boolean): ChatAccess {
  return { canRead, canPost: canRead && canPost, readOnly: canRead && !canPost };
}

export function chatAccess(viewer: ChatViewer, conversation: ConversationFacts): ChatAccess {
  const ownsStudent = viewer.ownStudentId === conversation.studentId;
  const active = conversation.studentActive;
  if (conversation.kind === 'student_school') {
    return access(ownsStudent || viewer.readAll, active);
  }
  const isInstructor =
    viewer.instructor &&
    viewer.membershipId !== null &&
    viewer.membershipId === conversation.instructorMembershipId;
  if (ownsStudent || isInstructor) {
    return access(true, active && (ownsStudent || conversation.instructorAssigned));
  }
  return access(viewer.readAll, false);
}

export function schoolCanRead(kind: ConversationKind): boolean {
  return kind === 'student_instructor';
}

export function isAfter(a: MessagePosition, b: MessagePosition): boolean {
  const diff = a.sentAt.getTime() - b.sentAt.getTime();
  return diff === 0 ? a.id > b.id : diff > 0;
}

export function laterPointer<T extends MessagePosition>(current: T | null, requested: T): T {
  return current && !isAfter(requested, current) ? current : requested;
}

export function messagePreview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= MESSAGE_PREVIEW_MAX
    ? flat
    : `${flat.slice(0, MESSAGE_PREVIEW_MAX - ELLIPSIS.length)}${ELLIPSIS}`;
}

export function otherParticipants(
  userIds: readonly (string | null)[],
  senderUserId: string,
): string[] {
  const unique = new Set<string>();
  for (const userId of userIds) {
    if (userId && userId !== senderUserId) unique.add(userId);
  }
  return [...unique];
}

export function retentionCutoff(now: Date, months: number): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}
