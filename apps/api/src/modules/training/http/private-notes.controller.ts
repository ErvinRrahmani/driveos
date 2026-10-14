import {
  type IdParams,
  idParamsSchema,
  type PrivateNoteListResponse,
  type PrivateNoteParams,
  privateNoteParamsSchema,
  type UpsertPrivateNoteRequest,
  upsertPrivateNoteRequestSchema,
} from '@driveos/shared';
import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { UpsertPrivateNoteCommand } from '../commands/upsert-private-note.command.js';
import { ListPrivateNotesQuery } from '../queries/list-private-notes.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('training')
@Controller('students')
export class PrivateNotesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':id/private-notes')
  @RequireAnyPermission('private_notes.read', 'private_notes.write.own')
  @ApiRoute({
    operationId: 'privateNotes.list',
    summary: "Staff-only private notes on a student's lessons (never shown to students or parents)",
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'PrivateNoteListResponse',
  })
  list(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
  ): Promise<PrivateNoteListResponse> {
    return this.queryBus.execute(new ListPrivateNotesQuery(actor, id));
  }

  @Put(':id/private-notes/:lessonId')
  @RequirePermission('private_notes.write.own')
  @ApiRoute({
    operationId: 'privateNotes.upsert',
    summary: "Write the caller's private note on a lesson (last write wins)",
    status: StatusCodes.OK,
    params: 'PrivateNoteParams',
    body: 'UpsertPrivateNoteRequest',
    response: 'CommandResult',
  })
  upsert(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(privateNoteParamsSchema)) { id, lessonId }: PrivateNoteParams,
    @Body(new ZodValidationPipe(upsertPrivateNoteRequestSchema)) body: UpsertPrivateNoteRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(
      new UpsertPrivateNoteCommand(actor, { lessonId, studentId: id, body: body.body }),
    );
  }
}
