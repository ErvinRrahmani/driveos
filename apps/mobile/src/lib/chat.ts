import type { Conversation } from '@driveos/shared';
import type { TFunction } from 'i18next';

export type ChatViewer = 'student' | 'instructor';

export function conversationTitle(
  t: TFunction,
  conversation: Conversation,
  viewer: ChatViewer,
): string {
  if (viewer === 'instructor') return conversation.studentName;
  return conversation.kind === 'student_instructor' && conversation.instructorName
    ? conversation.instructorName
    : t('chat.school');
}
