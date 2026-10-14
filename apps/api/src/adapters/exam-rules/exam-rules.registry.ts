import type { ExamRules } from '@driveos/shared';
import type {
  DrawableQuestion,
  ExamAnswer,
  ExamQuestion,
  ExamRulesName,
  ExamRulesStrategy,
  ExamScore,
  RandomSource,
} from './exam-rules.js';

export class ExamRulesRegistry {
  private readonly strategies: ReadonlyMap<ExamRulesName, ExamRulesStrategy>;

  constructor(strategies: readonly ExamRulesStrategy[]) {
    this.strategies = new Map(strategies.map((strategy) => [strategy.name, strategy]));
  }

  for(rules: ExamRules): ExamRulesStrategy {
    const strategy = this.strategies.get(rules.rules);
    if (!strategy) throw new Error(`No ExamRules strategy for "${rules.rules}"`);
    return strategy;
  }

  draw<Q extends DrawableQuestion>(
    rules: ExamRules,
    questions: readonly Q[],
    random?: RandomSource,
  ): Q[] {
    return this.for(rules).draw(rules, questions, random);
  }

  score(
    rules: ExamRules,
    questions: readonly ExamQuestion[],
    answers: readonly ExamAnswer[],
  ): ExamScore {
    return this.for(rules).score(rules, questions, answers);
  }
}
