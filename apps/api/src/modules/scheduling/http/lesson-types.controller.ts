import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreateLessonTypeRequest,
  createLessonTypeRequestSchema,
  type IdParams,
  idParamsSchema,
  type LessonTypeListResponse,
  type ListLessonTypesQuery as ListLessonTypesParams,
  listLessonTypesQuerySchema,
  type UpdateLessonTypeRequest,
  updateLessonTypeRequestSchema,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { CreateLessonTypeCommand } from '../commands/create-lesson-type.command.js';
import { UpdateLessonTypeCommand } from '../commands/update-lesson-type.command.js';
import { ListLessonTypesQuery } from '../queries/list-lesson-types.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('scheduling')
@Controller('lesson-types')
export class LessonTypesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission(
    'lesson_types.manage',
    'calendar.read',
    'calendar.read.own',
    'lessons.read.own',
  )
  @ApiRoute({
    operationId: 'lessonTypes.list',
    summary: 'Lesson types (length, credit cost, exam car)',
    status: StatusCodes.OK,
    query: 'ListLessonTypesQuery',
    response: 'LessonTypeListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listLessonTypesQuerySchema)) query: ListLessonTypesParams,
  ): Promise<LessonTypeListResponse> {
    return this.queryBus.execute(new ListLessonTypesQuery(query));
  }

  @Post()
  @RequirePermission('lesson_types.manage')
  @ApiRoute({
    operationId: 'lessonTypes.create',
    summary: 'Add a lesson type',
    status: StatusCodes.CREATED,
    body: 'CreateLessonTypeRequest',
    response: 'CommandResult',
  })
  create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createLessonTypeRequestSchema)) body: CreateLessonTypeRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreateLessonTypeCommand(actor, body));
  }

  @Patch(':id')
  @RequirePermission('lesson_types.manage')
  @ApiRoute({
    operationId: 'lessonTypes.update',
    summary: 'Change a lesson type',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'UpdateLessonTypeRequest',
    response: 'CommandResult',
  })
  update(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(updateLessonTypeRequestSchema)) body: UpdateLessonTypeRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdateLessonTypeCommand(actor, params.id, body));
  }
}
