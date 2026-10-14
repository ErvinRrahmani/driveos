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

export class ErrorPointsExamRules implements ExamRulesStrategy {
  readonly name = 'error_points' as const;

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
    const { maxErrorPoints } = this.own(rules);
    const { score, maxScore, wrong } = gradeAnswers(questions, answers);
    const errorPoints = maxScore - score;
    const instantFailedQuestionIds = wrong.filter((q) => q.instantFail).map((q) => q.id);
    return {
      score,
      maxScore,
      errorPoints,
      instantFailedQuestionIds,
      passed: errorPoints <= maxErrorPoints && instantFailedQuestionIds.length === 0,
    };
  }

  private own(rules: ExamRules): Extract<ExamRules, { rules: 'error_points' }> {
    if (rules.rules !== 'error_points') {
      throw new Error(`ErrorPointsExamRules got "${rules.rules}" rules, expected error_points`);
    }
    return rules;
  }
}
