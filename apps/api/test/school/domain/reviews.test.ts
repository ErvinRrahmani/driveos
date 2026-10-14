import { describe, expect, it } from 'vitest';
import { displayNameOf, reviewSummary } from '../../../src/modules/school/domain/reviews.js';

describe('displayNameOf', () => {
  it('uses first name and initial of the last name', () => {
    expect(displayNameOf('Stella Student')).toBe('Stella S.');
    expect(displayNameOf('Madonna')).toBe('Madonna');
    expect(displayNameOf('  Ana  Maria  Lopes ')).toBe('Ana L.');
  });
});

describe('reviewSummary', () => {
  it('averages approved ratings in tenths of a star', () => {
    expect(reviewSummary([5, 4])).toEqual({ count: 2, averageRatingTenths: 45 });
    expect(reviewSummary([5, 4, 4])).toEqual({ count: 3, averageRatingTenths: 43 });
    expect(reviewSummary([])).toEqual({ count: 0, averageRatingTenths: 0 });
  });
});
