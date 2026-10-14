import { Module } from '@nestjs/common';
import { FinishTheorySessionHandler } from './commands/finish-theory-session.handler.js';
import { ImportQuestionPackHandler } from './commands/import-question-pack.handler.js';
import { PublishQuestionPackHandler } from './commands/publish-question-pack.handler.js';
import { StartTheorySessionHandler } from './commands/start-theory-session.handler.js';
import { SubmitTheoryAnswerHandler } from './commands/submit-theory-answer.handler.js';
import { QuestionPacksController } from './http/question-packs.controller.js';
import { TheoryController } from './http/theory.controller.js';
import { QuestionPacksRepository } from './infra/question-packs.repository.js';
import { QuestionsRepository } from './infra/questions.repository.js';
import { TheoryLearners } from './infra/theory-learners.js';
import { TheorySessionsRepository } from './infra/theory-sessions.repository.js';
import { GetCurrentQuestionPackHandler } from './queries/get-current-question-pack.handler.js';
import { GetTheoryStatsHandler } from './queries/get-theory-stats.handler.js';
import { ListTheoryMistakesHandler } from './queries/list-theory-mistakes.handler.js';

@Module({
  controllers: [QuestionPacksController, TheoryController],
  providers: [
    QuestionPacksRepository,
    QuestionsRepository,
    TheorySessionsRepository,
    TheoryLearners,
    ImportQuestionPackHandler,
    PublishQuestionPackHandler,
    StartTheorySessionHandler,
    SubmitTheoryAnswerHandler,
    FinishTheorySessionHandler,
    GetCurrentQuestionPackHandler,
    ListTheoryMistakesHandler,
    GetTheoryStatsHandler,
  ],
})
export class TheoryModule {}
