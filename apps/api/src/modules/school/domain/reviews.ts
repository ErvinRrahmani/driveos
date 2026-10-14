/** First name plus the initial of the last name ("Stella S."); a single name is shown as is. */
export function displayNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts.at(-1) : undefined;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export interface ReviewSummary {
  count: number;
  /** Average rating × 10, rounded (4.5 stars = 45). */
  averageRatingTenths: number;
}

export function reviewSummary(ratings: readonly number[]): ReviewSummary {
  if (ratings.length === 0) return { count: 0, averageRatingTenths: 0 };
  const sum = ratings.reduce((total, rating) => total + rating, 0);
  return { count: ratings.length, averageRatingTenths: Math.round((sum * 10) / ratings.length) };
}
