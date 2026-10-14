import { describe, expect, it } from 'vitest';
import { lessonTypeIssues } from '../../../src/modules/scheduling/domain/lesson-type.js';

describe('lessonTypeIssues', () => {
  it('accepts an exam that requires the exam_car entitlement', () => {
    expect(lessonTypeIssues({ kind: 'exam', requiresEntitlement: 'exam_car' })).toEqual([]);
  });

  it('rejects an exam without the exam_car entitlement (D8)', () => {
    expect(lessonTypeIssues({ kind: 'exam', requiresEntitlement: null })).toEqual([
      {
        path: ['requiresEntitlement'],
        message: 'An exam lesson type requires the exam_car entitlement',
      },
    ]);
  });

  it('accepts a normal lesson with or without an entitlement', () => {
    expect(lessonTypeIssues({ kind: 'lesson', requiresEntitlement: null })).toEqual([]);
  });
});
