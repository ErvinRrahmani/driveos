import type { TheoryAnswerResult } from '@driveos/shared';
import { isAnswerCorrect } from '../../../adapters/exam-rules/exam-rules.js';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { ConflictError, invalidField, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { isPastDeadline } from '../domain/theory-sessions.js';
import { QuestionsRepository } from '../infra/questions.repository.js';
import { TheoryLearners } from '../infra/theory-learners.js';
import { TheorySessionsRepository } from '../infra/theory-sessions.repository.js';
import { SubmitTheoryAnswerCommand } from './submit-theory-answer.command.js';

export function sessionFinished(): ConflictError {
  return new ConflictError('session_finished', t('errors.session_finished'));
}

@CommandHandler(SubmitTheoryAnswerCommand)
export class SubmitTheoryAnswerHandler implements ICommandHandler<
  SubmitTheoryAnswerCommand,
  TheoryAnswerResult
> {
  constructor(
    private readonly learners: TheoryLearners,
    private readonly questions: QuestionsRepository,
    private readonly sessions: TheorySessionsRepository,
  ) {}

  async execute({
    actor,
    sessionId,
    body,
  }: SubmitTheoryAnswerCommand): Promise<TheoryAnswerResult> {
    const learner = await this.learners.self(actor);
    const session = await this.sessions.findOwned(sessionId, learner.studentId, {
      forUpdate: true,
    });
    if (!session) throw notFound();
    if (session.finishedAt) throw sessionFinished();
    const answeredAt = new Date();
    if (isPastDeadline(session.deadlineAt, answeredAt)) {
      throw new ConflictError('session_expired', t('errors.session_expired'));
    }
    if (!session.questionIds.includes(body.questionId)) {
      throw invalidField(['questionId'], 'The question is not part of this session');
    }
    const [question] = await this.questions.byIds([body.questionId]);
    if (!question) throw notFound();
    if (body.given.some((index) => index >= question.answers.length)) {
      throw invalidField(['given'], 'Unknown answer index');
    }
    const correct = isAnswerCorrect(body.given, question.correct);
    await this.sessions.upsertAnswer(session.id, {
      questionId: question.id,
      given: body.given,
      correct,
      answeredAt,
    });
    const reveal = session.mode !== 'mock';
    return {
      questionId: question.id,
      correct: reveal ? correct : null,
      correctAnswers: reveal ? question.correct : null,
      explanation: reveal ? question.explanation : null,
      answeredAt: answeredAt.toISOString(),
    };
  }
}
