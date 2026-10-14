import type { ExamRules } from '@driveos/shared';
import {
  type DrawableQuestion,
  drawExamQuestions,
  type ExamAnswer,
  type ExamQuestion,
  type ExamRulesStrategy,
  type ExamScore,
  gradeAnswers,
  type RandomSource,
} from './exam-rules.js';

const PASS_MARK_PRECISION = 1e6;

export class FractionExamRules implements ExamRulesStrategy {
  readonly name = 'fraction' as const;

  draw<Q extends DrawableQuestion>(
    rules: ExamRules,
    questions: readonly Q[],
    random?: RandomSource,
  ): Q[] {
    return drawExamQuestions(this.own(rules), questions, random);
  }

  score(
    rules: ExamRules,
    questions: readonly ExamQuestion[],
    answers: readonly ExamAnswer[],
  ): ExamScore {
    const { passMark } = this.own(rules);
    const { score, maxScore } = gradeAnswers(questions, answers);
    const needed = Math.ceil(
      Math.round(passMark * maxScore * PASS_MARK_PRECISION) / PASS_MARK_PRECISION,
    );
    return {
      score,
      maxScore,
      errorPoints: maxScore - score,
      instantFailedQuestionIds: [],
      passed: score >= needed,
    };
  }

  private own(rules: ExamRules): Extract<ExamRules, { rules: 'fraction' }> {
    if (rules.rules !== 'fraction') {
      throw new Error(`FractionExamRules got "${rules.rules}" rules, expected fraction`);
    }
    return rules;
  }
}
