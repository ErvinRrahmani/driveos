import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type IdParams,
  idParamsSchema,
  type ListTheoryMistakesQuery as ListTheoryMistakesParams,
  listTheoryMistakesQuerySchema,
  type StartTheorySessionRequest,
  startTheorySessionRequestSchema,
  type SubmitTheoryAnswerRequest,
  submitTheoryAnswerRequestSchema,
  type TheoryAnswerResult,
  type TheoryMistakeListResponse,
  type TheorySessionResponse,
  type TheorySessionResult,
  type TheoryStatsQuery,
  theoryStatsQuerySchema,
  type TheoryStatsResponse,
} from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { FinishTheorySessionCommand } from '../commands/finish-theory-session.command.js';
import { StartTheorySessionCommand } from '../commands/start-theory-session.command.js';
import { SubmitTheoryAnswerCommand } from '../commands/submit-theory-answer.command.js';
import { GetTheoryStatsQuery } from '../queries/get-theory-stats.query.js';
import { ListTheoryMistakesQuery } from '../queries/list-theory-mistakes.query.js';

@ApiTags('theory')
@Controller('theory')
export class TheoryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('sessions')
  @RequirePermission('theory.use')
  @ApiRoute({
    operationId: 'theorySessions.start',
    summary: 'Start a practice, mock exam or mistakes session',
    status: StatusCodes.CREATED,
    body: 'StartTheorySessionRequest',
    response: 'TheorySessionResponse',
  })
  startSession(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(startTheorySessionRequestSchema)) body: StartTheorySessionRequest,
  ): Promise<TheorySessionResponse> {
    return this.commandBus.execute(new StartTheorySessionCommand(actor, body));
  }

  @Post('sessions/:id/answers')
  @RequirePermission('theory.use')
  @ApiRoute({
    operationId: 'theorySessions.answer',
    summary: 'Answer a question in a session',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'SubmitTheoryAnswerRequest',
    response: 'TheoryAnswerResult',
  })
  answer(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
    @Body(new ZodValidationPipe(submitTheoryAnswerRequestSchema)) body: SubmitTheoryAnswerRequest,
  ): Promise<TheoryAnswerResult> {
    return this.commandBus.execute(new SubmitTheoryAnswerCommand(actor, id, body));
  }

  @Post('sessions/:id/finish')
  @RequirePermission('theory.use')
  @ApiRoute({
    operationId: 'theorySessions.finish',
    summary: 'Finish a session and get the score and review',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'TheorySessionResult',
  })
  finish(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
  ): Promise<TheorySessionResult> {
    return this.commandBus.execute(new FinishTheorySessionCommand(actor, id));
  }

  @Get('mistakes')
  @RequirePermission('theory.use')
  @ApiRoute({
    operationId: 'theory.mistakes',
    summary: 'Questions the student answered wrong',
    status: StatusCodes.OK,
    query: 'ListTheoryMistakesQuery',
    response: 'TheoryMistakeListResponse',
  })
  mistakes(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listTheoryMistakesQuerySchema)) query: ListTheoryMistakesParams,
  ): Promise<TheoryMistakeListResponse> {
    return this.queryBus.execute(new ListTheoryMistakesQuery(actor, query));
  }

  @Get('stats')
  @RequireAnyPermission('theory.use', 'progress.read', 'progress.read.own')
  @ApiRoute({
    operationId: 'theory.stats',
    summary: 'Theory statistics per category (own, or a student for staff and parents)',
    status: StatusCodes.OK,
    query: 'TheoryStatsQuery',
    response: 'TheoryStatsResponse',
  })
  stats(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(theoryStatsQuerySchema)) query: TheoryStatsQuery,
  ): Promise<TheoryStatsResponse> {
    return this.queryBus.execute(new GetTheoryStatsQuery(actor, query));
  }
}
