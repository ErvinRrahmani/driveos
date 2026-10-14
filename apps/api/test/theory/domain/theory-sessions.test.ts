import { describe, expect, it } from 'vitest';
import {
  type AnswerFact,
  deadlineFor,
  drawPractice,
  isPastDeadline,
  latestAnswers,
  mockExamsLeft,
  mockWindowStart,
  openMistakes,
} from '../../../src/modules/theory/domain/theory-sessions.js';
import { seededRandom } from '../../fakes/seeded-random.js';

const at = (iso: string) => new Date(iso);

const fact = (
  externalRef: string,
  correct: boolean,
  answeredAt: string,
  given: number[] = [0],
): AnswerFact => ({ externalRef, correct, given, answeredAt: at(answeredAt) });

describe('theory domain', () => {
  describe('openMistakes', () => {
    it('keeps only refs whose latest answer is wrong, newest first, with the wrong count', () => {
      const history = [
        fact('A', false, '2026-01-01T10:00:00Z', [1]),
        fact('A', true, '2026-01-02T10:00:00Z'),
        fact('B', false, '2026-01-01T09:00:00Z', [2]),
        fact('C', true, '2026-01-01T08:00:00Z'),
        fact('C', false, '2026-01-03T08:00:00Z', [0, 1]),
        fact('B', false, '2026-01-02T09:00:00Z', [1]),
      ];
      expect(openMistakes(history)).toEqual([
        {
          externalRef: 'C',
          lastGiven: [0, 1],
          lastAnsweredAt: at('2026-01-03T08:00:00Z'),
          wrongCount: 1,
        },
        {
          externalRef: 'B',
          lastGiven: [1],
          lastAnsweredAt: at('2026-01-02T09:00:00Z'),
          wrongCount: 2,
        },
      ]);
    });

    it('returns nothing without wrong answers', () => {
      expect(openMistakes([fact('A', true, '2026-01-01T10:00:00Z')])).toEqual([]);
      expect(openMistakes([])).toEqual([]);
    });
  });

  describe('latestAnswers', () => {
    it('keeps the latest answer per ref', () => {
      const latest = latestAnswers([
        fact('A', true, '2026-01-02T10:00:00Z'),
        fact('A', false, '2026-01-01T10:00:00Z'),
      ]);
      expect(latest.get('A')?.correct).toBe(true);
      expect(latest.get('A')?.wrongCount).toBe(1);
    });
  });

  describe('weekly mock allowance', () => {
    it('counts back seven days from now', () => {
      expect(mockWindowStart(at('2026-01-08T12:00:00Z'))).toEqual(at('2026-01-01T12:00:00Z'));
    });

    it('allows three free mocks per window and never goes negative', () => {
      expect(mockExamsLeft(0)).toBe(3);
      expect(mockExamsLeft(2)).toBe(1);
      expect(mockExamsLeft(3)).toBe(0);
      expect(mockExamsLeft(5)).toBe(0);
    });
  });

  describe('deadline', () => {
    it('adds the time limit to the start', () => {
      expect(deadlineFor(at('2026-01-01T10:00:00Z'), 45)).toEqual(at('2026-01-01T10:45:00Z'));
    });

    it('is past only after the deadline and never without one', () => {
      const deadline = at('2026-01-01T10:45:00Z');
      expect(isPastDeadline(deadline, at('2026-01-01T10:44:59Z'))).toBe(false);
      expect(isPastDeadline(deadline, at('2026-01-01T10:45:00Z'))).toBe(false);
      expect(isPastDeadline(deadline, at('2026-01-01T10:45:01Z'))).toBe(true);
      expect(isPastDeadline(null, at('2030-01-01T00:00:00Z'))).toBe(false);
    });
  });

  describe('drawPractice', () => {
    const questions = [
      { id: '1', category: 'signs' },
      { id: '2', category: 'signs' },
      { id: '3', category: 'rules' },
      { id: '4', category: 'rules' },
      { id: '5', category: 'rules' },
    ];

    it('draws distinct questions up to the count', () => {
      const drawn = drawPractice(questions, { count: 3 }, seededRandom(7));
      expect(drawn).toHaveLength(3);
      expect(new Set(drawn.map((q) => q.id)).size).toBe(3);
    });

    it('filters by category and caps at what is available', () => {
      const drawn = drawPractice(questions, { category: 'signs', count: 10 }, seededRandom(1));
      expect(drawn.map((q) => q.id).sort()).toEqual(['1', '2']);
    });

    it('returns nothing for an unknown category', () => {
      expect(drawPractice(questions, { category: 'parking', count: 3 })).toEqual([]);
    });
  });
});
