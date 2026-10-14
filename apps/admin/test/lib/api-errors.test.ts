import { describe, expect, it } from 'vitest';
import { apiErrorCode, apiErrorMessage, fieldErrorsFrom } from '../../src/lib/api-errors';

describe('api errors', () => {
  it('reads field errors from the API shape (details.issues)', () => {
    const error = {
      error: {
        code: 'validation_error',
        message: 'Invalid',
        details: {
          issues: [
            { path: ['name'], message: 'Too short' },
            { path: [], message: 'x' },
          ],
        },
      },
    };
    expect(fieldErrorsFrom(error)).toEqual({ name: 'Too short' });
  });

  it('reads field errors from the mock shape (details is the issue list)', () => {
    const error = {
      error: {
        code: 'validation_error',
        message: 'Invalid',
        details: [{ path: ['items', 0, 'closes'], message: 'opens must be before closes' }],
      },
    };
    expect(fieldErrorsFrom(error)).toEqual({ 'items[0].closes': 'opens must be before closes' });
  });

  it('returns no field errors for other errors', () => {
    expect(fieldErrorsFrom({ error: { code: 'not_found', message: 'Nope' } })).toEqual({});
    expect(fieldErrorsFrom(new TypeError('Failed to fetch'))).toEqual({});
  });

  it('exposes the code and the server message when there is one', () => {
    const error = { error: { code: 'lesson_conflict', message: 'Clash' } };
    expect(apiErrorCode(error)).toBe('lesson_conflict');
    expect(apiErrorMessage(error, 'fallback')).toBe('Clash');
    expect(apiErrorMessage(new TypeError('Failed to fetch'), 'fallback')).toBe('fallback');
    expect(apiErrorCode(undefined)).toBeNull();
  });
});
