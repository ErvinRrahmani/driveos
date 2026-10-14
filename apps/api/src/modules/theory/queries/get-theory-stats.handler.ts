import type { TheoryCategoryStats, TheoryStatsResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { latestAnswers, mockExamsLeft, mockWindowStart } from '../domain/theory-sessions.js';
import { QuestionsRepository } from '../infra/questions.repository.js';
import { type Learner, TheoryLearners } from '../infra/theory-learners.js';
import { TheorySessionsRepository } from '../infra/theory-sessions.repository.js';
import { GetTheoryStatsQuery } from './get-theory-stats.query.js';

@QueryHandler(GetTheoryStatsQuery)
export class GetTheoryStatsHandler implements IQueryHandler<
  GetTheoryStatsQuery,
  TheoryStatsResponse
> {
  constructor(
    private readonly learners: TheoryLearners,
    private readonly questions: QuestionsRepository,
    private readonly sessions: TheorySessionsRepository,
  ) {}

  async execute({ actor, params }: GetTheoryStatsQuery): Promise<TheoryStatsResponse> {
    const learner = await this.learner(actor, params.studentId);
    const { studentId } = learner;
    const premium = await this.learners.premium(studentId);
    const pack = await this.learners.currentPack(learner);
    const questions = pack ? await this.questions.byPack(pack.id) : [];
    const latest = latestAnswers(await this.sessions.history(studentId));
    const categories = new Map<string, TheoryCategoryStats>();
    let answered = 0;
    let correct = 0;
    for (const question of questions) {
      const stats = categories.get(question.category) ?? {
        category: question.category,
        questions: 0,
        answered: 0,
        correct: 0,
      };
      stats.questions += 1;
      const answer = latest.get(question.externalRef);
      if (answer) {
        stats.answered += 1;
        answered += 1;
        if (answer.correct) {
          stats.correct += 1;
          correct += 1;
        }
      }
      categories.set(question.category, stats);
    }
    const mocks = await this.sessions.mockSummary(studentId);
    const startedThisWeek = premium
      ? 0
      : await this.sessions.countStartedSince(studentId, 'mock', mockWindowStart(new Date()));
    return {
      studentId,
      packId: pack?.id ?? null,
      premium,
      questions: questions.length,
      answered,
      correct,
      openMistakes: answered - correct,
      mockExamsTaken: mocks.taken,
      mockExamsPassed: mocks.passed,
      lastMockScore: mocks.last?.score ?? null,
      lastMockMaxScore: mocks.last?.maxScore ?? null,
      mockExamsLeftThisWeek: premium ? null : mockExamsLeft(startedThisWeek),
      categories: [...categories.values()].sort((a, b) => a.category.localeCompare(b.category)),
    };
  }

  private async learner(actor: Principal, studentId: string | undefined): Promise<Learner> {
    if (studentId) return this.learners.of(actor, studentId);
    const own = await this.learners.ownStudentId(actor);
    if (!own) throw invalidField(['studentId'], 'Required for callers without a student profile');
    return this.learners.of(actor, own);
  }
}
