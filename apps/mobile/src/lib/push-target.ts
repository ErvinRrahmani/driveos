import { z } from 'zod';
import { externalReviewLink } from './review-flow';

const lessonData = z.object({ lessonId: z.uuid() });
const chatData = z.object({ template: z.literal('message_received'), conversationId: z.uuid() });
const reviewData = z.object({
  template: z.literal('review_request'),
  externalReviewUrl: z.unknown().optional(),
});

export const REVIEW_HREF = '/student/review';

export function instructorPushTarget(data: unknown): string | null {
  const lesson = lessonData.safeParse(data);
  if (lesson.success) return `/instructor/lesson/${lesson.data.lessonId}`;
  const chat = chatData.safeParse(data);
  if (chat.success) return `/instructor/chat/${chat.data.conversationId}`;
  return null;
}

export function studentPushTarget(data: unknown): string | null {
  const review = reviewData.safeParse(data);
  if (!review.success) return null;
  const external = externalReviewLink(review.data.externalReviewUrl);
  return external
    ? `${REVIEW_HREF}?externalReviewUrl=${encodeURIComponent(external)}`
    : REVIEW_HREF;
}
