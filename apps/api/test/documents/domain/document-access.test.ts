import { describe, expect, it } from 'vitest';
import {
  INSTRUCTOR_LESSON_LOOKBACK_DAYS,
  instructorLessonWindowStart,
  canSeeDocument,
  resolveUploadOwner,
} from '../../../src/modules/documents/domain/document-access.js';

describe('resolveUploadOwner', () => {
  it('lets staff upload for any student or for the school', () => {
    expect(resolveUploadOwner({ scope: 'all', ownStudentId: null, requested: 's1' })).toEqual({
      ok: true,
      ownerStudentId: 's1',
    });
    expect(resolveUploadOwner({ scope: 'all', ownStudentId: null })).toEqual({
      ok: true,
      ownerStudentId: null,
    });
  });

  it('defaults a student to their own record and refuses anyone else', () => {
    const scope = new Set(['own']);
    expect(resolveUploadOwner({ scope, ownStudentId: 'own' })).toEqual({
      ok: true,
      ownerStudentId: 'own',
    });
    expect(resolveUploadOwner({ scope, ownStudentId: 'own', requested: 'other' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('asks an instructor or parent to choose one of their students', () => {
    const scope = new Set(['a', 'b']);
    expect(resolveUploadOwner({ scope, ownStudentId: null })).toEqual({
      ok: false,
      reason: 'student_required',
    });
    expect(resolveUploadOwner({ scope, ownStudentId: null, requested: 'b' })).toEqual({
      ok: true,
      ownerStudentId: 'b',
    });
  });
});

describe('canSeeDocument', () => {
  it('shows school documents to staff only', () => {
    expect(canSeeDocument('all', null)).toBe(true);
    expect(canSeeDocument(new Set(['s1']), null)).toBe(false);
  });

  it("shows a student's documents to those who see the student", () => {
    expect(canSeeDocument(new Set(['s1']), 's1')).toBe(true);
    expect(canSeeDocument(new Set(['s1']), 's2')).toBe(false);
  });
});

describe('instructorLessonWindowStart', () => {
  it('starts the instructor lesson window 90 days before now', () => {
    expect(INSTRUCTOR_LESSON_LOOKBACK_DAYS).toBe(90);
    expect(instructorLessonWindowStart(new Date('2026-10-12T10:00:00Z'))).toEqual(
      new Date('2026-07-14T10:00:00Z'),
    );
  });
});
