import type { ExamRules } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import { ErrorPointsExamRules } from '../../src/adapters/exam-rules/error-points-exam-rules.js';
import {
  type ExamAnswer,
  type ExamQuestion,
  isAnswerCorrect,
} from '../../src/adapters/exam-rules/exam-rules.js';
import { ExamRulesRegistry } from '../../src/adapters/exam-rules/exam-rules.registry.js';
import { FractionExamRules } from '../../src/adapters/exam-rules/fraction-exam-rules.js';
import { seededRandom } from '../fakes/seeded-random.js';

const question = (
  id: string,
  category: string,
  points = 1,
  extra: Partial<ExamQuestion> = {},
): ExamQuestion => ({ id, category, points, correct: [0], instantFail: false, ...extra });

const fraction = (passMark: number, questions = 4): ExamRules => ({
  rules: 'fraction',
  passMark,
  questions,
  timeLimitMinutes: 30,
});

const errorPoints = (maxErrorPoints: number, questions = 4): ExamRules => ({
  rules: 'error_points',
  maxErrorPoints,
  questions,
  timeLimitMinutes: 30,
});

const right = (q: ExamQuestion): ExamAnswer => ({ questionId: q.id, given: [...q.correct] });
const wrong = (q: ExamQuestion): ExamAnswer => ({ questionId: q.id, given: [9] });

const pool = (counts: Record<string, number>): ExamQuestion[] =>
  Object.entries(counts).flatMap(([category, count]) =>
    Array.from({ length: count }, (_, i) => question(`${category}-${i}`, category)),
  );

const countByCategory = (questions: readonly ExamQuestion[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const q of questions) counts[q.category] = (counts[q.category] ?? 0) + 1;
  return counts;
};

describe('isAnswerCorrect', () => {
  it('needs exactly the correct set, in any order', () => {
    expect(isAnswerCorrect([0, 2], [2, 0])).toBe(true);
    expect(isAnswerCorrect([0], [0, 2])).toBe(false);
    expect(isAnswerCorrect([0, 1, 2], [0, 2])).toBe(false);
    expect(isAnswerCorrect([], [0])).toBe(false);
  });
});

describe('FractionExamRules.score', () => {
  const rules = new FractionExamRules();
  const a = question('a', 'signs', 2);
  const b = question('b', 'signs', 3);
  const c = question('c', 'rules', 5);
  const d = question('d', 'rules', 10);
  const qs = [a, b, c, d];

  it('passes exactly at the pass mark', () => {
    const answers = [right(a), right(b), wrong(c), right(d)];
    expect(rules.score(fraction(0.75), qs, answers)).toEqual({
      score: 15,
      maxScore: 20,
      errorPoints: 5,
      instantFailedQuestionIds: [],
      passed: true,
    });
  });

  it('fails one point below the pass mark and counts unanswered questions as wrong', () => {
    const answers = [right(a), wrong(b), right(d)];
    const result = rules.score(fraction(0.75), qs, answers);
    expect(result).toMatchObject({ score: 12, maxScore: 20, errorPoints: 8, passed: false });
  });

  it('is not fooled by floating point at the mark (0.85 of 20 = 17)', () => {
    const qs20 = Array.from({ length: 20 }, (_, i) => question(`q${i}`, 'signs'));
    const answers = qs20.map((q, i) => (i < 17 ? right(q) : wrong(q)));
    expect(rules.score(fraction(0.85, 20), qs20, answers).passed).toBe(true);
    const fewer = qs20.map((q, i) => (i < 16 ? right(q) : wrong(q)));
    expect(rules.score(fraction(0.85, 20), qs20, fewer).passed).toBe(false);
  });

  it('refuses rules of the other strategy', () => {
    expect(() => rules.score(errorPoints(4), qs, [])).toThrow(/fraction/);
  });
});

describe('ErrorPointsExamRules.score', () => {
  const rules = new ErrorPointsExamRules();
  const a = question('a', 'signs', 2);
  const b = question('b', 'signs', 3);
  const c = question('c', 'rules', 5, { instantFail: true });
  const d = question('d', 'rules', 1);
  const qs = [a, b, c, d];

  it('passes with error points at the maximum', () => {
    const answers = [right(a), wrong(b), right(c), right(d)];
    expect(rules.score(errorPoints(3), qs, answers)).toEqual({
      score: 8,
      maxScore: 11,
      errorPoints: 3,
      instantFailedQuestionIds: [],
      passed: true,
    });
  });

  it('fails with error points above the maximum', () => {
    const answers = [wrong(a), wrong(b), right(c), right(d)];
    expect(rules.score(errorPoints(4), qs, answers)).toMatchObject({
      errorPoints: 5,
      passed: false,
    });
  });

  it('fails on a wrong instant-fail question even when the points would pass', () => {
    const answers = [right(a), right(b), wrong(c), right(d)];
    expect(rules.score(errorPoints(10), qs, answers)).toEqual({
      score: 6,
      maxScore: 11,
      errorPoints: 5,
      instantFailedQuestionIds: ['c'],
      passed: false,
    });
  });

  it('treats an unanswered instant-fail question as failed', () => {
    const answers = [right(a), right(b), right(d)];
    expect(rules.score(errorPoints(10), qs, answers)).toMatchObject({
      instantFailedQuestionIds: ['c'],
      passed: false,
    });
  });

  it('uses the last answer given to a question', () => {
    const answers = [wrong(c), right(c), right(a), right(b), right(d)];
    expect(rules.score(errorPoints(0), qs, answers)).toMatchObject({
      errorPoints: 0,
      passed: true,
    });
  });
});

describe('draw', () => {
  const rules = new FractionExamRules();
  const withCategories: ExamRules = {
    ...fraction(0.8, 10),
    categories: { signs: 3, rules: 5, safety: 2 },
  };

  it('follows the per-category counts and the total', () => {
    const drawn = rules.draw(
      withCategories,
      pool({ signs: 6, rules: 8, safety: 4 }),
      seededRandom(1),
    );
    expect(drawn).toHaveLength(10);
    expect(new Set(drawn.map((q) => q.id)).size).toBe(10);
    expect(countByCategory(drawn)).toEqual({ signs: 3, rules: 5, safety: 2 });
  });

  it('fills the rest of the total from any category when the counts add up to less', () => {
    const rulesWithGap: ExamRules = { ...fraction(0.8, 6), categories: { signs: 2 } };
    const drawn = rules.draw(rulesWithGap, pool({ signs: 5, rules: 5 }), seededRandom(7));
    expect(drawn).toHaveLength(6);
    expect(drawn.filter((q) => q.category === 'signs').length).toBeGreaterThanOrEqual(2);
  });

  it('draws the total at random without categories', () => {
    const drawn = rules.draw(fraction(0.8, 5), pool({ signs: 4, rules: 4 }), seededRandom(3));
    expect(drawn).toHaveLength(5);
    expect(new Set(drawn.map((q) => q.id)).size).toBe(5);
  });

  it('is deterministic for a seeded random source and varies with the seed', () => {
    const questions = pool({ signs: 6, rules: 8, safety: 4 });
    const ids = (seed: number) =>
      rules.draw(withCategories, questions, seededRandom(seed)).map((q) => q.id);
    expect(ids(42)).toEqual(ids(42));
    expect(ids(42)).not.toEqual(ids(43));
  });

  it('refuses a pack that cannot fill a category', () => {
    expect(() =>
      rules.draw(withCategories, pool({ signs: 2, rules: 8, safety: 4 }), seededRandom(1)),
    ).toThrow(/signs/);
  });
});

describe('ExamRulesRegistry', () => {
  const registry = new ExamRulesRegistry([new FractionExamRules(), new ErrorPointsExamRules()]);

  it('picks the strategy named by the rules', () => {
    const a = question('a', 'signs', 1, { instantFail: true });
    const b = question('b', 'signs', 1);
    const qs = [a, b];
    const answers = [wrong(a), right(b)];
    expect(registry.score(fraction(0.5, 2), qs, answers).passed).toBe(true);
    expect(registry.score(errorPoints(1, 2), qs, answers).passed).toBe(false);
  });

  it('draws through the strategy', () => {
    const drawn = registry.draw(errorPoints(2, 3), pool({ signs: 5 }), seededRandom(1));
    expect(drawn).toHaveLength(3);
  });
});
