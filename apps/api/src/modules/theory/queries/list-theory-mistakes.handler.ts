import type { TheoryMistake, TheoryMistakeListResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { openMistakes } from '../domain/theory-sessions.js';
import { QuestionsRepository } from '../infra/questions.repository.js';
import { TheoryLearners } from '../infra/theory-learners.js';
import { TheorySessionsRepository } from '../infra/theory-sessions.repository.js';
import { ListTheoryMistakesQuery } from './list-theory-mistakes.query.js';

@QueryHandler(ListTheoryMistakesQuery)
export class ListTheoryMistakesHandler implements IQueryHandler<
  ListTheoryMistakesQuery,
  TheoryMistakeListResponse
> {
  constructor(
    private readonly learners: TheoryLearners,
    private readonly questions: QuestionsRepository,
    private readonly sessions: TheorySessionsRepository,
  ) {}

  async execute({ actor, params }: ListTheoryMistakesQuery): Promise<TheoryMistakeListResponse> {
    const learner = await this.learners.self(actor);
    const pack = await this.learners.requireCurrentPack(learner);
    const byRef = new Map(
      (await this.questions.byPack(pack.id)).map((question) => [question.externalRef, question]),
    );
    const mistakes = openMistakes(await this.sessions.history(learner.studentId)).flatMap(
      (mistake) => {
        const question = byRef.get(mistake.externalRef);
        if (!question) return [];
        if (params.category && question.category !== params.category) return [];
        return [{ mistake, question }];
      },
    );
    const cursor = idCursor(params.cursor);
    let start = 0;
    if (cursor) {
      const index = mistakes.findIndex(({ question }) => question.id === cursor);
      if (index < 0) throw invalidField(['cursor'], 'Unknown cursor');
      start = index + 1;
    }
    const page = pageOf(
      mistakes.slice(start, start + params.limit + 1),
      params.limit,
      ({ question }) => question.id,
    );
    const items: TheoryMistake[] = await Promise.all(
      page.items.map(async ({ mistake, question }) => ({
        question: await this.learners.view(question),
        lastGiven: mistake.lastGiven,
        lastAnsweredAt: mistake.lastAnsweredAt.toISOString(),
        wrongCount: mistake.wrongCount,
      })),
    );
    return { items, nextCursor: page.nextCursor };
  }
}
