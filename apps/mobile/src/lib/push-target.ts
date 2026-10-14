import { z } from 'zod';

const lessonData = z.object({ lessonId: z.uuid() });
const chatData = z.object({ template: z.literal('message_received'), conversationId: z.uuid() });

export function instructorPushTarget(data: unknown): string | null {
  const lesson = lessonData.safeParse(data);
  if (lesson.success) return `/instructor/lesson/${lesson.data.lessonId}`;
  const chat = chatData.safeParse(data);
  if (chat.success) return `/instructor/chat/${chat.data.conversationId}`;
  return null;
}
