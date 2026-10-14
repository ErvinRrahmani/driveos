import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type BookLessonRequest,
  bookLessonRequestSchema,
  type CancelLessonRequest,
  cancelLessonRequestSchema,
  type CancelLessonResponse,
  type CompleteLessonRequest,
  completeLessonRequestSchema,
  type IdParams,
  idParamsSchema,
  type LessonResponse,
  type MarkNoShowRequest,
  markNoShowRequestSchema,
  type MoveLessonRequest,
  moveLessonRequestSchema,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult } from '../../../kernel/cqrs/index.js';
import { Idempotent } from '../../../kernel/idempotency/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission } from '../../identity/index.js';
import { BookLessonCommand } from '../commands/book-lesson.command.js';
import { CancelLessonCommand } from '../commands/cancel-lesson.command.js';
import { CompleteLessonCommand } from '../commands/complete-lesson.command.js';
import { MarkNoShowCommand } from '../commands/mark-no-show.command.js';
import { MoveLessonCommand } from '../commands/move-lesson.command.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('scheduling')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @Idempotent()
  @RequireAnyPermission('lessons.create', 'lessons.create.own')
  @ApiRoute({
    operationId: 'lessons.book',
    summary: 'Book a lesson (takes credits from the ledger)',
    status: StatusCodes.CREATED,
    body: 'BookLessonRequest',
    response: 'LessonResponse',
  })
  book(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(bookLessonRequestSchema)) body: BookLessonRequest,
  ): Promise<LessonResponse> {
    return this.commandBus.execute(new BookLessonCommand(actor, body));
  }

  @Patch(':id')
  @RequireAnyPermission('lessons.move', 'lessons.move.own')
  @ApiRoute({
    operationId: 'lessons.move',
    summary: 'Move a lesson to another time, instructor or vehicle',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'MoveLessonRequest',
    response: 'CommandResult',
  })
  move(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(moveLessonRequestSchema)) body: MoveLessonRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new MoveLessonCommand(actor, params.id, body));
  }

  @Post(':id/cancel')
  @RequireAnyPermission('lessons.cancel', 'lessons.cancel.own')
  @ApiRoute({
    operationId: 'lessons.cancel',
    summary: 'Cancel a lesson; credits come back unless the cancellation is late',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'CancelLessonRequest',
    response: 'CancelLessonResponse',
  })
  cancel(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(cancelLessonRequestSchema)) body: CancelLessonRequest,
  ): Promise<CancelLessonResponse> {
    return this.commandBus.execute(new CancelLessonCommand(actor, params.id, body));
  }

  @Post(':id/complete')
  @RequireAnyPermission('lessons.complete', 'lessons.complete.own')
  @ApiRoute({
    operationId: 'lessons.complete',
    summary: 'Mark a lesson as completed, with optional progress',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'CompleteLessonRequest',
    response: 'CommandResult',
  })
  complete(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(completeLessonRequestSchema)) body: CompleteLessonRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CompleteLessonCommand(actor, params.id, body));
  }

  @Post(':id/no-show')
  @RequireAnyPermission('lessons.complete', 'lessons.complete.own')
  @ApiRoute({
    operationId: 'lessons.markNoShow',
    summary: 'Mark a lesson as a no-show',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'MarkNoShowRequest',
    response: 'CommandResult',
  })
  markNoShow(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(markNoShowRequestSchema)) body: MarkNoShowRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new MarkNoShowCommand(actor, params.id, body));
  }
}
