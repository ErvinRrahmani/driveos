import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type IdParams,
  idParamsSchema,
  type ListReviewsQuery as ListReviewsParams,
  listReviewsQuerySchema,
  type ModerateReviewRequest,
  moderateReviewRequestSchema,
  type ReviewListResponse,
  type SubmitReviewRequest,
  submitReviewRequestSchema,
} from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { ModerateReviewCommand } from '../commands/moderate-review.command.js';
import { SubmitReviewCommand } from '../commands/submit-review.command.js';
import { ListReviewsQuery } from '../queries/list-reviews.query.js';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @RequirePermission('reviews.submit')
  @ApiRoute({
    operationId: 'reviews.submit',
    summary: 'Review the school (students who passed the practical test, once)',
    status: StatusCodes.CREATED,
    body: 'SubmitReviewRequest',
    response: 'CommandResult',
  })
  submit(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(submitReviewRequestSchema)) body: SubmitReviewRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new SubmitReviewCommand(actor, body));
  }

  @Get()
  @RequirePermission('reviews.moderate')
  @ApiRoute({
    operationId: 'reviews.list',
    summary: "The school's reviews, newest first",
    status: StatusCodes.OK,
    query: 'ListReviewsQuery',
    response: 'ReviewListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listReviewsQuerySchema)) query: ListReviewsParams,
  ): Promise<ReviewListResponse> {
    return this.queryBus.execute(new ListReviewsQuery(query));
  }

  @Patch(':id')
  @RequirePermission('reviews.moderate')
  @ApiRoute({
    operationId: 'reviews.moderate',
    summary: 'Approve (show on the public page) or hide a review',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'ModerateReviewRequest',
    response: 'CommandResult',
  })
  moderate(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(moderateReviewRequestSchema)) body: ModerateReviewRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new ModerateReviewCommand(actor, params.id, body));
  }
}
