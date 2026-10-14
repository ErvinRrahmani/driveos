import type { TheorySessionResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { EXAM_RULES } from '../../../adapters/exam-rules/exam-rules.js';
import type { ExamRulesRegistry } from '../../../adapters/exam-rules/exam-rules.registry.js';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { ConflictError, invalidField } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import {
  deadlineFor,
  drawPractice,
  mockExamsLeft,
  mockWindowStart,
  openMistakes,
} from '../domain/theory-sessions.js';
import { type QuestionRecord, QuestionsRepository } from '../infra/questions.repository.js';
import { type Learner, premiumRequired, TheoryLearners } from '../infra/theory-learners.js';
import { TheorySessionsRepository } from '../infra/theory-sessions.repository.js';
import { StartTheorySessionCommand } from './start-theory-session.command.js';

export const DEFAULT_SESSION_QUESTIONS = 20;

@CommandHandler(StartTheorySessionCommand)
export class StartTheorySessionHandler implements ICommandHandler<
  StartTheorySessionCommand,
  TheorySessionResponse
> {
  constructor(
    private readonly learners: TheoryLearners,
    private readonly questions: QuestionsRepository,
    private readonly sessions: TheorySessionsRepository,
    @Inject(EXAM_RULES) private readonly examRules: ExamRulesRegistry,
  ) {}

  async execute({ actor, body }: StartTheorySessionCommand): Promise<TheorySessionResponse> {
    const learner = await this.learners.self(actor);
    const pack = await this.learners.requireCurrentPack(learner);
    const startedAt = new Date();
    const count = body.questionCount ?? DEFAULT_SESSION_QUESTIONS;
    const all = await this.questions.byPack(pack.id);
    let drawn: QuestionRecord[];
    let deadlineAt: Date | null = null;
    switch (body.mode) {
      case 'practice':
        drawn = drawPractice(all, { category: body.category, count });
        if (drawn.length === 0) throw invalidField(['category'], 'No questions in this category');
        break;
      case 'mock':
        await this.requireMockAllowance(learner, startedAt);
        drawn = this.examRules.draw(pack.exam, all);
        deadlineAt = deadlineFor(startedAt, pack.exam.timeLimitMinutes);
        break;
      case 'mistakes':
        drawn = await this.drawMistakes(learner, all, body.category, count);
        break;
    }
    const session = await this.sessions.insert({
      studentId: learner.studentId,
      packId: pack.id,
      mode: body.mode,
      questionIds: drawn.map((question) => question.id),
      startedAt,
      deadlineAt,
    });
    return {
      id: session.id,
      packId: session.packId,
      mode: session.mode,
      questionIds: session.questionIds,
      questions: await Promise.all(drawn.map((question) => this.learners.view(question))),
      answeredQuestionIds: [],
      startedAt: session.startedAt.toISOString(),
      deadlineAt: session.deadlineAt?.toISOString() ?? null,
      finishedAt: null,
    };
  }

  private async requireMockAllowance(learner: Learner, now: Date): Promise<void> {
    if (await this.learners.premium(learner.studentId)) return;
    await this.sessions.lockStudent(learner.studentId);
    const started = await this.sessions.countStartedSince(
      learner.studentId,
      'mock',
      mockWindowStart(now),
    );
    if (mockExamsLeft(started) === 0) throw premiumRequired();
  }

  private async drawMistakes(
    learner: Learner,
    all: readonly QuestionRecord[],
    category: string | undefined,
    count: number,
  ): Promise<QuestionRecord[]> {
    if (!(await this.learners.premium(learner.studentId))) throw premiumRequired();
    const byRef = new Map(all.map((question) => [question.externalRef, question]));
    const mistakes = openMistakes(await this.sessions.history(learner.studentId)).flatMap(
      (mistake) => {
        const question = byRef.get(mistake.externalRef);
        return question ? [question] : [];
      },
    );
    const drawn = drawPractice(mistakes, { category, count });
    if (drawn.length === 0) throw new ConflictError('no_mistakes', t('errors.no_mistakes'));
    return drawn;
  }
}
