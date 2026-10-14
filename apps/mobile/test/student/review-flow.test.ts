import { describe, expect, it } from 'vitest';
import { NETWORK_ERROR, type ApiFailure } from '../../src/lib/api-errors';
import {
  externalReviewLink,
  REVIEW_TEXT_MAX,
  reviewOutcome,
  reviewSubmission,
  reviewTextRemaining,
} from '../../src/lib/review-flow';

const failure = (code: string): ApiFailure => ({ ok: false, code, message: null });

describe('reviewSubmission', () => {
  it('requires a rating before anything else', () => {
    expect(reviewSubmission({ rating: null, text: 'Great school' })).toEqual({
      ok: false,
      reason: 'rating_required',
    });
  });

  it('accepts whole ratings from 1 to 5 only', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(reviewSubmission({ rating, text: '' })).toEqual({ ok: true, body: { rating } });
    }
    for (const rating of [0, 6, 2.5, -1, Number.NaN]) {
      expect(reviewSubmission({ rating, text: '' })).toEqual({
        ok: false,
        reason: 'rating_required',
      });
    }
  });

  it('trims the text and omits it when empty', () => {
    expect(reviewSubmission({ rating: 4, text: '  Patient instructors.  ' })).toEqual({
      ok: true,
      body: { rating: 4, text: 'Patient instructors.' },
    });
    expect(reviewSubmission({ rating: 4, text: '   \n ' })).toEqual({
      ok: true,
      body: { rating: 4 },
    });
  });

  it('allows exactly 600 characters after trimming and refuses more', () => {
    const max = 'a'.repeat(REVIEW_TEXT_MAX);
    expect(REVIEW_TEXT_MAX).toBe(600);
    expect(reviewSubmission({ rating: 5, text: `  ${max}  ` })).toEqual({
      ok: true,
      body: { rating: 5, text: max },
    });
    expect(reviewSubmission({ rating: 5, text: `${max}b` })).toEqual({
      ok: false,
      reason: 'text_too_long',
    });
  });
});

describe('reviewTextRemaining', () => {
  it('counts the characters left of the 600 allowed', () => {
    expect(reviewTextRemaining('')).toBe(600);
    expect(reviewTextRemaining('Great')).toBe(595);
    expect(reviewTextRemaining('a'.repeat(601))).toBe(-1);
  });
});

describe('reviewOutcome', () => {
  it('shows "not yet" when the student has not passed the practical test', () => {
    expect(reviewOutcome(failure('review_not_available'))).toBe('not_available');
  });

  it('shows "already sent" when the student reviewed before', () => {
    expect(reviewOutcome(failure('review_exists'))).toBe('already_sent');
  });

  it('treats every other failure as a generic error', () => {
    expect(reviewOutcome(failure('not_found'))).toBe('error');
    expect(reviewOutcome(failure('validation_error'))).toBe('error');
    expect(reviewOutcome(failure(NETWORK_ERROR))).toBe('error');
  });
});

describe('externalReviewLink', () => {
  it('keeps an https link', () => {
    expect(externalReviewLink('https://g.page/r/fahrschule-spree/review')).toBe(
      'https://g.page/r/fahrschule-spree/review',
    );
  });

  it('drops missing, non-https and malformed values', () => {
    expect(externalReviewLink(undefined)).toBeNull();
    expect(externalReviewLink(null)).toBeNull();
    expect(externalReviewLink('')).toBeNull();
    expect(externalReviewLink('http://g.page/r/fahrschule-spree/review')).toBeNull();
    expect(externalReviewLink('javascript:alert(1)')).toBeNull();
    expect(externalReviewLink('not a url')).toBeNull();
    expect(externalReviewLink(['https://g.page/r/a'])).toBeNull();
  });
});
