import { TheorySessionFinished, type TheorySessionResult } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import {
  EXAM_RULES,
  gradeAnswers,
  isAnswerCorrect,
} from '../../../adapters/exam-rules/exam-rules.js';
import type { ExamRulesRegistry } from '../../../adapters/exam-rules/exam-rules.registry.js';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { QuestionPacksRepository } from '../infra/question-packs.repository.js';
import { QuestionsRepository } from '../infra/questions.repository.js';
import { TheoryLearners } from '../infra/theory-learners.js';
import { TheorySessionsRepository } from '../infra/theory-sessions.repository.js';
import { FinishTheorySessionCommand } from './finish-theory-session.command.js';
import { sessionFinished } from './submit-theory-answer.handler.js';

export const THEORY_SESSION_AGGREGATE = 'theory_session';
const FINISHED_VERSION = 2;

@CommandHandler(FinishTheorySessionCommand)
export class FinishTheorySessionHandler implements ICommandHandler<
  FinishTheorySessionCommand,
  TheorySessionResult
> {
  constructor(
    private readonly learners: TheoryLearners,
    private readonly packs: QuestionPacksRepository,
    private readonly questions: QuestionsRepository,
    private readonly sessions: TheorySessionsRepository,
    private readonly events: EventPublisher,
    @Inject(EXAM_RULES) private readonly examRules: ExamRulesRegistry,
  ) {}

  async execute({ actor, sessionId }: FinishTheorySessionCommand): Promise<TheorySessionResult> {
    const learner = await this.learners.self(actor);
    const session = await this.sessions.findOwned(sessionId, learner.studentId, {
      forUpdate: true,
    });
    if (!session) throw notFound();
    if (session.finishedAt) throw sessionFinished();
    const questions = await this.questions.byIds(session.questionIds);
    const answers = await this.sessions.answers(session.id);
    const given = new Map(answers.map((answer) => [answer.questionId, answer.given]));
    let score: number;
    let maxScore: number;
    let passed: boolean | null = null;
    if (session.mode === 'mock') {
      const pack = await this.packs.find(session.packId);
      if (!pack) throw notFound();
      ({ score, maxScore, passed } = this.examRules.score(pack.exam, questions, answers));
    } else {
      ({ score, maxScore } = gradeAnswers(questions, answers));
    }
    const finishedAt = new Date();
    await this.sessions.finish(session.id, { finishedAt, score, maxScore, passed });
    await this.events.append([
      newEvent(TheorySessionFinished, {
        aggregateType: THEORY_SESSION_AGGREGATE,
        aggregateId: session.id,
        aggregateVersion: FINISHED_VERSION,
        occurredAt: finishedAt,
        payload: {
          sessionId: session.id,
          studentId: session.studentId,
          packId: session.packId,
          mode: session.mode,
          questionCount: session.questionIds.length,
          score,
          maxScore,
          passed,
          startedAt: session.startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
        },
      }),
    ]);
    return {
      id: session.id,
      mode: session.mode,
      score,
      maxScore,
      passed,
      finishedAt: finishedAt.toISOString(),
      results: questions.map((question) => {
        const answer = given.get(question.id) ?? null;
        return {
          questionId: question.id,
          given: answer,
          correct: answer !== null && isAnswerCorrect(answer, question.correct),
          correctAnswers: question.correct,
          points: question.points,
          explanation: question.explanation,
        };
      }),
    };
  }
}
