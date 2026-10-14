import type { SubmitReviewRequest } from '@driveos/shared';
import type { AppServices } from './api';
import type { ApiFailure } from './api-errors';
import { failure, type FlowResult, send } from './flow';

export const REVIEW_TEXT_MAX = 600;
export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;

export interface ReviewDraft {
  rating: number | null;
  text: string;
}

export type ReviewSubmission =
  | { ok: true; body: SubmitReviewRequest }
  | { ok: false; reason: 'rating_required' | 'text_too_long' };

export type ReviewOutcome = 'not_available' | 'already_sent' | 'error';

const isRating = (value: number | null): value is SubmitReviewRequest['rating'] =>
  value !== null && Number.isInteger(value) && value >= 1 && value <= 5;

/** The body for `POST /v1/reviews`, or why the draft cannot be sent yet. */
export function reviewSubmission(draft: ReviewDraft): ReviewSubmission {
  if (!isRating(draft.rating)) return { ok: false, reason: 'rating_required' };
  const text = draft.text.trim();
  if (text.length > REVIEW_TEXT_MAX) return { ok: false, reason: 'text_too_long' };
  return { ok: true, body: text ? { rating: draft.rating, text } : { rating: draft.rating } };
}

export function reviewTextRemaining(text: string): number {
  return REVIEW_TEXT_MAX - text.trim().length;
}

/** The screen state for a refused review. */
export function reviewOutcome(result: ApiFailure): ReviewOutcome {
  if (result.code === 'review_not_available') return 'not_available';
  if (result.code === 'review_exists') return 'already_sent';
  return 'error';
}

export async function submitReview(
  services: AppServices,
  body: SubmitReviewRequest,
): Promise<FlowResult<{ id: string }>> {
  const result = await send(() => services.api.fetchClient.POST('/v1/reviews', { body }));
  return result.ok ? { ok: true, id: result.data.id } : failure(result);
}
