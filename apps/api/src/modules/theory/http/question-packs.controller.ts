import {
  type CurrentQuestionPackQuery,
  currentQuestionPackQuerySchema,
  type QuestionPack,
} from '@driveos/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { GetCurrentQuestionPackQuery } from '../queries/get-current-question-pack.query.js';

@ApiTags('theory')
@Controller('question-packs')
export class QuestionPacksController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('current')
  @RequirePermission('theory.use')
  @ApiRoute({
    operationId: 'questionPacks.current',
    summary: 'The published question pack for a licence class, with its exam rules',
    status: StatusCodes.OK,
    query: 'CurrentQuestionPackQuery',
    response: 'QuestionPack',
  })
  current(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(currentQuestionPackQuerySchema)) query: CurrentQuestionPackQuery,
  ): Promise<QuestionPack> {
    return this.queryBus.execute(new GetCurrentQuestionPackQuery(actor, query));
  }
}
