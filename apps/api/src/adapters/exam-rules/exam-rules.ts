import type { ExamRules } from '@driveos/shared';

export const EXAM_RULES = Symbol('EXAM_RULES');

export type ExamRulesName = ExamRules['rules'];

export type RandomSource = () => number;

export interface DrawableQuestion {
  id: string;
  category: string;
}

export interface ExamQuestion extends DrawableQuestion {
  points: number;
  correct: readonly number[];
  instantFail: boolean;
}

export interface ExamAnswer {
  questionId: string;
  given: readonly number[];
}

export interface ExamScore {
  score: number;
  maxScore: number;
  errorPoints: number;
  instantFailedQuestionIds: string[];
  passed: boolean;
}

export interface ExamRulesStrategy {
  readonly name: ExamRulesName;
  draw<Q extends DrawableQuestion>(
    rules: ExamRules,
    questions: readonly Q[],
    random?: RandomSource,
  ): Q[];
  score(
    rules: ExamRules,
    questions: readonly ExamQuestion[],
    answers: readonly ExamAnswer[],
  ): ExamScore;
}

export function isAnswerCorrect(given: readonly number[], correct: readonly number[]): boolean {
  const expected = new Set(correct);
  const actual = new Set(given);
  return actual.size === expected.size && [...actual].every((index) => expected.has(index));
}

export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export function drawExamQuestions<Q extends DrawableQuestion>(
  rules: ExamRules,
  questions: readonly Q[],
  random: RandomSource = Math.random,
): Q[] {
  const drawn: Q[] = [];
  const taken = new Set<string>();
  for (const [category, count] of Object.entries(rules.categories ?? {})) {
    const candidates = questions.filter((q) => q.category === category);
    if (candidates.length < count) {
      throw new Error(
        `Exam rules need ${count} questions in category ${category}, the pack has ${candidates.length}`,
      );
    }
    for (const question of shuffle(candidates, random).slice(0, count)) {
      drawn.push(question);
      taken.add(question.id);
    }
  }
  if (drawn.length > rules.questions) {
    throw new Error(`Exam rules categories add up to more than ${rules.questions} questions`);
  }
  const rest = shuffle(
    questions.filter((q) => !taken.has(q.id)),
    random,
  ).slice(0, rules.questions - drawn.length);
  if (drawn.length + rest.length < rules.questions) {
    throw new Error(
      `Exam rules need ${rules.questions} questions, the pack has ${questions.length}`,
    );
  }
  return shuffle([...drawn, ...rest], random);
}

export function gradeAnswers(
  questions: readonly ExamQuestion[],
  answers: readonly ExamAnswer[],
): { score: number; maxScore: number; wrong: ExamQuestion[] } {
  const latest = new Map(answers.map((answer) => [answer.questionId, answer.given]));
  let score = 0;
  let maxScore = 0;
  const wrong: ExamQuestion[] = [];
  for (const question of questions) {
    maxScore += question.points;
    const given = latest.get(question.id);
    if (given && isAnswerCorrect(given, question.correct)) score += question.points;
    else wrong.push(question);
  }
  return { score, maxScore, wrong };
}
