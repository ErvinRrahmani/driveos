import type { Conversation, Message } from '@driveos/shared';

export function canPost(conversation: Conversation, membershipId: string | undefined): boolean {
  if (conversation.readOnly) return false;
  if (conversation.kind === 'student_school') return true;
  return conversation.instructorMembershipId === membershipId;
}

export function mergeMessagePages(pages: readonly { items: readonly Message[] }[]): Message[] {
  const byId = new Map<string, Message>();
  for (const page of pages) for (const message of page.items) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}
